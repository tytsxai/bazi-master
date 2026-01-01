import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../config/logger.js';
import { generateAIContent, resolveAiProvider, buildBaziPrompt } from './ai.service.js';
import { getChatSystemPrompt, buildZiweiPrompt } from './prompts.service.js';
import { authorizeToken } from '../middleware/auth.js';
import { createAiGuard } from '../lib/concurrency.js';
import { prisma } from '../config/prisma.js';

const PING_INTERVAL_MS = 30000;
const MAX_MESSAGE_BYTES = 1_000_000;
const wsAiGuard = createAiGuard();
const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';

let wssInstance = null;

const parseCookieHeader = (header) => {
  if (!header || typeof header !== 'string') return {};
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    const key = index >= 0 ? part.slice(0, index).trim() : part.trim();
    if (!key) return acc;
    const rawValue = index >= 0 ? part.slice(index + 1).trim() : '';
    try {
      acc[key] = decodeURIComponent(rawValue);
    } catch {
      acc[key] = rawValue;
    }
    return acc;
  }, {});
};

export const initWebsocketServer = (server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  wssInstance = wss;

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/ai') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }

    socket.destroy();
  });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    const cookies = parseCookieHeader(req.headers?.cookie);
    ws.sessionToken = cookies?.bazi_session || null;
    logger.info({ ip }, '[ws] Client connected');

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
      try {
        const size =
          typeof message === 'string' ? Buffer.byteLength(message, 'utf8') : message?.length || 0;
        if (size > MAX_MESSAGE_BYTES) {
          sendError(ws, 'Message too large');
          closeSocket(ws, 1009, 'Message too large');
          return;
        }

        const raw = typeof message === 'string' ? message : message.toString('utf8');
        const data = JSON.parse(raw);
        await handleMessage(ws, data);
      } catch (error) {
        logger.error({ error }, '[ws] Message handling error');
        sendError(ws, 'Invalid message format or internal error');
      }
    });

    ws.on('close', () => {
      logger.info({ ip }, '[ws] Client disconnected');
    });

    ws.on('error', (error) => {
      logger.error({ error }, '[ws] Connection error');
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();

      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
};

export const closeWebsocketServer = ({
  code = 1001,
  reason = 'Server shutdown',
  loggerInstance = logger,
} = {}) => {
  if (!wssInstance) return;

  try {
    wssInstance.clients.forEach((ws) => {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate?.();
      }
    });
  } catch (error) {
    loggerInstance.warn?.({ err: error }, '[ws] Failed to close client connections');
  }

  try {
    wssInstance.close();
  } catch (error) {
    loggerInstance.warn?.({ err: error }, '[ws] Failed to close server');
  } finally {
    wssInstance = null;
  }
};

const sendError = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
};

const sendChunk = (ws, content) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'chunk', content }));
  }
};

const sendDone = (ws) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'done' }));
  }
};

const closeSocket = (ws, code = 1000, reason = 'Complete') => {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }
};

const authorizeWebsocket = async (ws, token) => {
  const normalized = typeof token === 'string' ? token.trim() : '';
  const sessionToken = typeof ws?.sessionToken === 'string' ? ws.sessionToken.trim() : '';
  const candidate = normalized || sessionToken;
  if (!candidate) {
    sendError(ws, 'Unauthorized');
    closeSocket(ws, 1008, 'Unauthorized');
    return null;
  }
  try {
    const user = await authorizeToken(candidate);
    ws.user = user;
    return user;
  } catch {
    sendError(ws, 'Unauthorized');
    closeSocket(ws, 1008, 'Unauthorized');
    return null;
  }
};

const handleMessage = async (ws, data) => {
  const type = typeof data?.type === 'string' ? data.type : '';
  const payload = data?.payload;
  const provider = data?.provider ?? payload?.provider;
  const token = data?.token ?? payload?.token;

  if (!type) {
    sendError(ws, 'Missing message type');
    return;
  }

  const requiresAuth = [
    'chat_request',
    'tarot_ai_request',
    'bazi_ai_request',
    'ziwei_ai_request',
    'iching_ai_request',
  ].includes(type);

  const user = requiresAuth ? await authorizeWebsocket(ws, token) : null;
  if (requiresAuth && !user) return;

  const release = requiresAuth ? wsAiGuard.acquire(user.id) : null;
  if (requiresAuth && !release) {
    sendError(ws, AI_CONCURRENCY_ERROR);
    return;
  }

  try {
    if (type === 'chat_request') {
      await handleChatRequest(ws, payload, provider);
      return;
    }
    if (type === 'tarot_ai_request') {
      await handleTarotRequest(ws, payload, provider);
      return;
    }
    if (type === 'bazi_ai_request') {
      await handleBaziRequest(ws, payload, provider);
      return;
    }
    if (type === 'ziwei_ai_request') {
      await handleZiweiRequest(ws, payload, provider);
      return;
    }
    if (type === 'iching_ai_request') {
      await handleIchingRequest(ws, payload, provider);
      return;
    }
    sendError(ws, `Unknown message type: ${type}`);
  } finally {
    if (release) release();
  }
};

const handleChatRequest = async (ws, payload, providerInput) => {
  const { messages, mode, context } = payload || {};
  const provider = providerInput ?? payload?.provider;

  if (!Array.isArray(messages) || messages.length === 0) {
    sendError(ws, 'Messages array is required');
    return;
  }
  if (messages.length > 50) {
    sendError(ws, 'Too many messages');
    return;
  }

  const systemPrompt = getChatSystemPrompt(mode, context);

  try {
    ws.send(JSON.stringify({ type: 'start' }));

    await generateAIContent({
      system: systemPrompt,
      messages,
      provider,
      onChunk: (chunk) => sendChunk(ws, chunk),
    });

    sendDone(ws);
  } catch (error) {
    logger.error({ error }, '[ws] Chat generation error');
    sendError(ws, 'Failed to generate AI response');
  }
};

const handleTarotRequest = async (ws, payload, providerInput) => {
  const { spreadType, cards, userQuestion } = payload || {};
  const provider = providerInput ?? payload?.provider;

  if (!Array.isArray(cards) || cards.length === 0) {
    sendError(ws, 'Tarot cards required');
    closeSocket(ws, 1008, 'Bad request');
    return;
  }

  const cardDescriptions = cards
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} (${c.positionLabel || `Position ${i + 1}`}): ${c.isReversed ? 'Reversed' : 'Upright'}`
    )
    .join('\n');

  const system = 'You are an expert Tarot reader. Provide a detailed, insightful interpretation.';
  const user = `
Question: ${userQuestion || 'General Reading'}
Spread: ${spreadType}
Cards:
${cardDescriptions}

Interpret this spread, focusing on the question. connecting the cards together.
    `.trim();

  try {
    ws.send(JSON.stringify({ type: 'start' }));

    const content = await generateAIContent({
      system,
      user,
      provider,
      onChunk: (chunk) => sendChunk(ws, chunk),
    });

    try {
      await prisma.tarotRecord.create({
        data: {
          userId: ws.user?.id,
          spreadType:
            typeof spreadType === 'string' && spreadType.trim() ? spreadType.trim() : 'SingleCard',
          cards: JSON.stringify(cards),
          userQuestion: typeof userQuestion === 'string' ? userQuestion : null,
          aiInterpretation: content,
        },
      });
    } catch (error) {
      logger.error({ error }, '[ws] Failed to persist tarot history');
    }

    sendDone(ws);
    closeSocket(ws, 1000, 'Tarot complete');
  } catch (error) {
    logger.error({ error }, '[ws] Tarot generation error');
    sendError(ws, 'Failed to generate interpretation');
    closeSocket(ws, 1011, 'Tarot error');
  }
};

const handleBaziRequest = async (ws, payload, providerInput) => {
  if (!payload?.pillars) {
    sendError(ws, 'BaZi data required');
    closeSocket(ws, 1008, 'Bad request');
    return;
  }

  let provider = null;
  try {
    provider = resolveAiProvider(providerInput);
  } catch (error) {
    sendError(ws, error.message || 'Invalid AI provider.');
    closeSocket(ws, 1008, 'Bad provider');
    return;
  }

  const { system, user, fallback } = buildBaziPrompt({
    pillars: payload.pillars,
    fiveElements: payload.fiveElements,
    tenGods: payload.tenGods,
    luckCycles: payload.luckCycles,
    strength: payload.strength,
  });

  try {
    ws.send(JSON.stringify({ type: 'start' }));
    await generateAIContent({
      system,
      user,
      fallback,
      provider,
      onChunk: (chunk) => sendChunk(ws, chunk),
    });
    sendDone(ws);
    closeSocket(ws, 1000, 'BaZi complete');
  } catch (error) {
    logger.error({ error }, '[ws] BaZi generation error');
    sendError(ws, 'Failed to generate BaZi interpretation');
    closeSocket(ws, 1011, 'BaZi error');
  }
};

const handleZiweiRequest = async (ws, payload, providerInput) => {
  if (!payload?.chart) {
    sendError(ws, 'Ziwei chart data required');
    closeSocket(ws, 1008, 'Bad request');
    return;
  }

  let provider = null;
  try {
    provider = resolveAiProvider(providerInput);
  } catch (error) {
    sendError(ws, error.message || 'Invalid AI provider.');
    closeSocket(ws, 1008, 'Bad provider');
    return;
  }

  const { system, user, fallback } = buildZiweiPrompt({
    chart: payload.chart,
    birth: payload.birth || payload,
  });

  try {
    ws.send(JSON.stringify({ type: 'start' }));
    await generateAIContent({
      system,
      user,
      fallback,
      provider,
      onChunk: (chunk) => sendChunk(ws, chunk),
    });
    sendDone(ws);
    closeSocket(ws, 1000, 'Ziwei complete');
  } catch (error) {
    logger.error({ error }, '[ws] Ziwei generation error');
    sendError(ws, 'Failed to generate Ziwei interpretation');
    closeSocket(ws, 1011, 'Ziwei error');
  }
};

const handleIchingRequest = async (ws, payload, providerInput) => {
  if (!payload?.hexagram) {
    sendError(ws, 'Hexagram data required');
    closeSocket(ws, 1008, 'Bad request');
    return;
  }

  let provider = null;
  try {
    provider = resolveAiProvider(providerInput);
  } catch (error) {
    sendError(ws, error.message || 'Invalid AI provider.');
    closeSocket(ws, 1008, 'Bad provider');
    return;
  }

  const system =
    'You are an I Ching interpreter. Provide a concise reading in Markdown with sections: Overview, Changing Lines, Guidance. Keep under 220 words.';
  const user = [
    `Hexagram: ${payload.hexagram?.name || payload.hexagram?.number || 'Unknown'}`,
    payload.resultingHexagram
      ? `Resulting: ${payload.resultingHexagram?.name || payload.resultingHexagram?.number}`
      : null,
    Array.isArray(payload.changingLines) && payload.changingLines.length
      ? `Changing Lines: ${payload.changingLines.join(', ')}`
      : null,
    payload.method ? `Method: ${payload.method}` : null,
    payload.timeContext ? `Time Context: ${payload.timeContext}` : null,
    payload.userQuestion ? `Question: ${payload.userQuestion}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const fallback = () =>
    '## ☯️ I Ching Reading\n\n**Overview:** The hexagram advises steady progress with mindful timing.\n\n**Guidance:** Act with clarity, avoid forcing outcomes, and align with the changing conditions.';

  try {
    ws.send(JSON.stringify({ type: 'start' }));
    await generateAIContent({
      system,
      user,
      fallback,
      provider,
      onChunk: (chunk) => sendChunk(ws, chunk),
    });
    sendDone(ws);
    closeSocket(ws, 1000, 'I Ching complete');
  } catch (error) {
    logger.error({ error }, '[ws] I Ching generation error');
    sendError(ws, 'Failed to generate I Ching interpretation');
    closeSocket(ws, 1011, 'I Ching error');
  }
};

export const getWebsocketMetrics = () => {
  if (!wssInstance) return { status: 'not_initialized' };

  return {
    status: 'ok',
    totalConnections: wssInstance.clients.size,
    activeAiRequests: wsAiGuard.size(),
    timestamp: new Date().toISOString(),
  };
};

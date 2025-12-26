import { WebSocketServer } from 'ws';
import { logger } from '../config/logger.js';
import { generateAIContent } from './ai.service.js';
import { getChatSystemPrompt } from './prompts.service.js';


// Heartbeat interval

// Heartbeat interval
const PING_INTERVAL_MS = 30000;

export const initWebsocketServer = (server) => {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        // Basic path check if needed, e.g. /ws/ai
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

        if (pathname === '/ws/ai') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        logger.info({ ip }, '[ws] Client connected');

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
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

    // Keep-alive mechanism
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

const sendError = (ws, message) => {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message }));
    }
};

const sendChunk = (ws, content) => {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'chunk', content }));
    }
};

const sendDone = (ws) => {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'done' }));
    }
};

const handleMessage = async (ws, data) => {
    const { type, payload } = data; // Added token/provider handling if needed

    // Validate auth if necessary (omitted for brevity, assume relying on simple check or open for now as per plan/prototype)
    // Ideally should verify token from data.token

    if (type === 'chat_request') {
        return handleChatRequest(ws, payload);
    } else if (type === 'tarot_ai_request') {
        return handleTarotRequest(ws, payload);
    } else {
        sendError(ws, `Unknown message type: ${type}`);
    }
};

const handleChatRequest = async (ws, payload) => {
    const { messages, provider, mode, context } = payload;

    if (!Array.isArray(messages) || messages.length === 0) {
        return sendError(ws, 'Messages array is required');
    }

    // System prompt for the assistant based on mode and context
    const systemPrompt = getChatSystemPrompt(mode, context);

    try {
        ws.send(JSON.stringify({ type: 'start' }));

        await generateAIContent({
            system: systemPrompt,
            messages: messages, // New param support
            provider: provider,
            onChunk: (chunk) => sendChunk(ws, chunk)
        });

        sendDone(ws);
    } catch (error) {
        logger.error({ error }, '[ws] Chat generation error');
        sendError(ws, 'Failed to generate AI response');
    }
};

const handleTarotRequest = async (ws, payload) => {
    const { spreadType, cards, userQuestion, provider } = payload;

    // Construct prompt from tarot data
    const cardDescriptions = cards.map((c, i) =>
        `${i + 1}. ${c.name} (${c.positionLabel || 'Position ' + (i + 1)}): ${c.isReversed ? 'Reversed' : 'Upright'}`
    ).join('\n');

    const system = "You are an expert Tarot reader. Provide a detailed, insightful interpretation.";
    const user = `
Question: ${userQuestion || 'General Reading'}
Spread: ${spreadType}
Cards:
${cardDescriptions}

Interpret this spread, focusing on the question. connecting the cards together.
    `.trim();

    try {
        ws.send(JSON.stringify({ type: 'start' }));

        await generateAIContent({
            system,
            user, // Legacy generic user prompt
            provider: provider,
            onChunk: (chunk) => sendChunk(ws, chunk)
        });

        sendDone(ws);
    } catch (error) {
        logger.error({ error }, '[ws] Tarot generation error');
        sendError(ws, 'Failed to generate interpretation');
    }
};

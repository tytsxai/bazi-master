import { createAiGuard, createInFlightDeduper } from '../lib/concurrency.js';

const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS) || 15000;

const fetchWithTimeout = async (url, options, timeoutMs = AI_TIMEOUT_MS) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetch(url, options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const ensureMinDuration = async (startedAtMs, minDurationMs) => {
  if (!Number.isFinite(minDurationMs) || minDurationMs <= 0) return;
  const elapsed = Date.now() - startedAtMs;
  const remaining = minDurationMs - elapsed;
  if (remaining > 0) {
    await new Promise(resolve => setTimeout(resolve, remaining));
  }
};

const callOpenAI = async ({ system, user }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 700,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

const callOpenAIStream = async ({ system, user, onChunk }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 700,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

const callAnthropic = async ({ system, user }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 700,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
};

const callAnthropicStream = async ({ system, user, onChunk }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 700,
      system,
      messages: [{ role: 'user', content: user }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              onChunk(parsed.delta.text);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

const generateAIContent = async ({ system, user, fallback, provider, onChunk }) => {
  const AI_PROVIDER = provider || process.env.AI_PROVIDER || 'mock';
  const RESET_REQUEST_MIN_DURATION_MS = parseInt(process.env.RESET_REQUEST_MIN_DURATION_MS) || 350;
  const startedAt = Date.now();

  try {
    if (AI_PROVIDER === 'mock') {
      await ensureMinDuration(startedAt, RESET_REQUEST_MIN_DURATION_MS);
      return fallback || 'Mock AI response - configure AI provider for real responses';
    }

    const aiGuard = createAiGuard();
    const release = await aiGuard.acquire();

    try {
      let result = '';
      const onChunkWrapper = onChunk ? (chunk) => {
        result += chunk;
        onChunk(chunk);
      } : (chunk) => { result += chunk; };

      if (AI_PROVIDER === 'openai') {
        if (onChunk) {
          await callOpenAIStream({ system, user, onChunk: onChunkWrapper });
        } else {
          result = await callOpenAI({ system, user });
        }
      } else if (AI_PROVIDER === 'anthropic') {
        if (onChunk) {
          await callAnthropicStream({ system, user, onChunk: onChunkWrapper });
        } else {
          result = await callAnthropic({ system, user });
        }
      } else {
        throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
      }

      return result;
    } finally {
      release();
    }
  } finally {
    await ensureMinDuration(startedAt, RESET_REQUEST_MIN_DURATION_MS);
  }
};

export { generateAIContent };

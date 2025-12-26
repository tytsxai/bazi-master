import { getServerConfig as getServerConfigFromEnv } from '../env.js';
import { createAiGuard } from '../lib/concurrency.js';

const {
  aiProvider: AI_PROVIDER,
  openaiApiKey: OPENAI_API_KEY,
  anthropicApiKey: ANTHROPIC_API_KEY,
  openaiModel: OPENAI_MODEL,
  anthropicModel: ANTHROPIC_MODEL,
  aiMaxTokens: AI_MAX_TOKENS,
  aiTimeoutMs: AI_TIMEOUT_MS,
  availableProviders: AVAILABLE_PROVIDERS,
  resetRequestMinDurationMs: RESET_REQUEST_MIN_DURATION_MS,
} = getServerConfigFromEnv();

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
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
};

const normalizeProviderName = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const resolveAiProvider = (requestedProvider) => {
  const normalized = normalizeProviderName(requestedProvider);
  const provider = normalized || AI_PROVIDER || 'mock';
  const providerMeta = AVAILABLE_PROVIDERS?.find((item) => item.name === provider);
  if (!providerMeta) {
    throw new Error('Unknown AI provider.');
  }
  if (!providerMeta.enabled) {
    throw new Error('Requested AI provider is not available.');
  }
  return provider;
};

const callOpenAI = async ({ system, user }) => {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const model = OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: Number.isFinite(AI_MAX_TOKENS) ? AI_MAX_TOKENS : 700,
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
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');

  const model = OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: Number.isFinite(AI_MAX_TOKENS) ? AI_MAX_TOKENS : 700,
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
  if (!ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured');

  const model = ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: Number.isFinite(AI_MAX_TOKENS) ? AI_MAX_TOKENS : 700,
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
  if (!ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured');

  const model = ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: Number.isFinite(AI_MAX_TOKENS) ? AI_MAX_TOKENS : 700,
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

const resolveFallback = (fallback) => {
  if (typeof fallback === 'function') return fallback();
  if (typeof fallback === 'string' && fallback.trim()) return fallback;
  return 'Mock AI response - configure AI provider for real responses';
};

const generateAIContent = async ({ system, user, fallback, provider, onChunk }) => {
  const resolvedProvider = resolveAiProvider(provider);
  const startedAt = Date.now();

  try {
    if (resolvedProvider === 'mock') {
      const content = resolveFallback(fallback);
      if (onChunk) {
        onChunk(content);
      }
      return content;
    }

    const aiGuard = createAiGuard();
    const release = await aiGuard.acquire();

    try {
      let result = '';
      const onChunkWrapper = onChunk
        ? (chunk) => {
          result += chunk;
          onChunk(chunk);
        }
        : (chunk) => {
          result += chunk;
        };

      if (resolvedProvider === 'openai') {
        if (onChunk) {
          await callOpenAIStream({ system, user, onChunk: onChunkWrapper });
        } else {
          result = await callOpenAI({ system, user });
        }
      } else if (resolvedProvider === 'anthropic') {
        if (onChunk) {
          await callAnthropicStream({ system, user, onChunk: onChunkWrapper });
        } else {
          result = await callAnthropic({ system, user });
        }
      } else {
        throw new Error(`Unsupported AI provider: ${resolvedProvider}`);
      }

      return result;
    } finally {
      release();
    }
  } finally {
    await ensureMinDuration(startedAt, RESET_REQUEST_MIN_DURATION_MS);
  }
};

export {
  callOpenAI,
  callOpenAIStream,
  callAnthropic,
  callAnthropicStream,
  generateAIContent,
  resolveAiProvider,
};

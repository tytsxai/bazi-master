import { getServerConfig as getServerConfigFromEnv } from '../config/app.js';
import { createAiGuard } from '../lib/concurrency.js';

const getAiConfig = () => {
  const config = getServerConfigFromEnv();
  return {
    aiProvider: config.aiProvider,
    openaiApiKey: config.openaiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    openaiModel: config.openaiModel,
    anthropicModel: config.anthropicModel,
    aiMaxTokens: config.aiMaxTokens,
    aiTimeoutMs: config.aiTimeoutMs,
    availableProviders: config.availableProviders,
    resetRequestMinDurationMs: config.resetRequestMinDurationMs,
  };
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
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

const resolveAiProviderWithConfig = (requestedProvider, { aiProvider, availableProviders }) => {
  const normalized = normalizeProviderName(requestedProvider);
  const provider = normalized || aiProvider || 'mock';
  const providerMeta = availableProviders?.find((item) => item.name === provider);
  if (!providerMeta) {
    throw new Error('Unknown AI provider.');
  }
  if (!providerMeta.enabled) {
    throw new Error('Requested AI provider is not available.');
  }
  return provider;
};

const resolveAiProvider = (requestedProvider) =>
  resolveAiProviderWithConfig(requestedProvider, getAiConfig());

const callOpenAIWithConfig = async (config, { system, user, messages }) => {
  if (!config.openaiApiKey) throw new Error('OpenAI API key not configured');

  const model = config.openaiModel || 'gpt-4o-mini';

  let apiMessages = [];
  if (messages && Array.isArray(messages)) {
    apiMessages = [
      { role: 'system', content: system },
      ...messages
    ];
  } else {
    apiMessages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: Number.isFinite(config.aiMaxTokens) ? config.aiMaxTokens : 700,
    }),
  }, config.aiTimeoutMs);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

const callOpenAI = async ({ system, user, messages }) =>
  callOpenAIWithConfig(getAiConfig(), { system, user, messages });

const callOpenAIStreamWithConfig = async (config, { system, user, messages, onChunk }) => {
  if (!config.openaiApiKey) throw new Error('OpenAI API key not configured');

  const model = config.openaiModel || 'gpt-4o-mini';

  let apiMessages = [];
  if (messages && Array.isArray(messages)) {
    apiMessages = [
      { role: 'system', content: system },
      ...messages
    ];
  } else {
    apiMessages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: Number.isFinite(config.aiMaxTokens) ? config.aiMaxTokens : 700,
      stream: true,
    }),
  }, config.aiTimeoutMs);

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

const callOpenAIStream = async ({ system, user, messages, onChunk }) =>
  callOpenAIStreamWithConfig(getAiConfig(), { system, user, messages, onChunk });

const callAnthropicWithConfig = async (config, { system, user, messages }) => {
  if (!config.anthropicApiKey) throw new Error('Anthropic API key not configured');

  const model = config.anthropicModel || 'claude-3-5-sonnet-20240620';

  let apiMessages = [];
  if (messages && Array.isArray(messages)) {
    // Anthropic messages API only wants user/assistant roles in messages. System is separate.
    apiMessages = messages.filter(m => m.role !== 'system');
  } else {
    apiMessages = [{ role: 'user', content: user }];
  }

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: Number.isFinite(config.aiMaxTokens) ? config.aiMaxTokens : 700,
      system,
      messages: apiMessages,
    }),
  }, config.aiTimeoutMs);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
};

const callAnthropic = async ({ system, user, messages }) =>
  callAnthropicWithConfig(getAiConfig(), { system, user, messages });

const callAnthropicStreamWithConfig = async (config, { system, user, messages, onChunk }) => {
  if (!config.anthropicApiKey) throw new Error('Anthropic API key not configured');

  const model = config.anthropicModel || 'claude-3-5-sonnet-20240620';

  let apiMessages = [];
  if (messages && Array.isArray(messages)) {
    apiMessages = messages.filter(m => m.role !== 'system');
  } else {
    apiMessages = [{ role: 'user', content: user }];
  }

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: Number.isFinite(config.aiMaxTokens) ? config.aiMaxTokens : 700,
      system,
      messages: apiMessages,
      stream: true,
    }),
  }, config.aiTimeoutMs);

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

const callAnthropicStream = async ({ system, user, messages, onChunk }) =>
  callAnthropicStreamWithConfig(getAiConfig(), { system, user, messages, onChunk });

const resolveFallback = (fallback) => {
  if (typeof fallback === 'function') return fallback();
  if (typeof fallback === 'string' && fallback.trim()) return fallback;
  return 'Mock AI response - configure AI provider for real responses';
};

const generateAIContent = async ({ system, user, messages, fallback, provider, onChunk }) => {
  const config = getAiConfig();
  const resolvedProvider = resolveAiProviderWithConfig(provider, config);
  const startedAt = Date.now();

  try {
    if (resolvedProvider === 'mock') {
      const content = resolveFallback(fallback);
      if (onChunk) {
        onChunk(content);
      }
      return content;
    }

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
        await callOpenAIStreamWithConfig(config, { system, user, messages, onChunk: onChunkWrapper });
      } else {
        result = await callOpenAIWithConfig(config, { system, user, messages });
      }
    } else if (resolvedProvider === 'anthropic') {
      if (onChunk) {
        await callAnthropicStreamWithConfig(config, { system, user, messages, onChunk: onChunkWrapper });
      } else {
        result = await callAnthropicWithConfig(config, { system, user, messages });
      }
    } else {
      throw new Error(`Unsupported AI provider: ${resolvedProvider}`);
    }

    return result;
  } finally {
    await ensureMinDuration(startedAt, config.resetRequestMinDurationMs);
  }
};

const buildBaziPrompt = ({ pillars, fiveElements, tenGods, luckCycles, strength }) => {
  const elementLines = fiveElements
    ? Object.entries(fiveElements).map(([key, value]) => `- ${key}: ${value}`).join('\n')
    : '- Not provided';
  const tenGodLines = Array.isArray(tenGods)
    ? tenGods
      .filter((tg) => tg?.strength > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map((tg) => `- ${tg.name}: ${tg.strength}`)
      .join('\n')
    : '- Not provided';
  const luckLines = Array.isArray(luckCycles)
    ? luckCycles.map((cycle) => `- ${cycle.range}: ${cycle.stem}${cycle.branch}`).join('\n')
    : '- Not provided';

  const system = 'You are a seasoned BaZi practitioner. Provide a concise, grounded interpretation in Markdown with sections: Summary, Key Patterns, Advice. Keep under 220 words.';
  const user = `
Day Master: ${pillars?.day?.stem || 'Unknown'} (${pillars?.day?.elementStem || 'Unknown'})
Month Pillar: ${pillars?.month?.stem || 'Unknown'} ${pillars?.month?.branch || 'Unknown'} (${pillars?.month?.elementBranch || 'Unknown'})
Five Elements:
${elementLines}
Ten Gods (top):
${tenGodLines}
Luck Cycles:
${luckLines}
Strength Notes: ${strength || 'Not provided'}
  `.trim();

  const fallback = () => {
    const summary = `A ${pillars?.day?.elementStem || 'balanced'} Day Master chart with notable elemental distribution.`;
    const patterns = tenGodLines;
    const advice = 'Focus on balancing elements that are lower in count and lean into favorable cycles.';
    return `
## 🔮 BaZi Insight
**Summary:** ${summary}

**Key Patterns:**
${patterns}

**Advice:** ${advice}
    `.trim();
  };

  return { system, user, fallback };
};

const callOpenAIImage = async (config, { prompt }) => {
  if (!config.openaiApiKey) throw new Error('OpenAI API key not configured');

  const response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    }),
  }, config.aiTimeoutMs * 2); // Images take longer

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Image API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.data[0]?.url || '';
};

const generateImage = async ({ prompt, provider = 'openai' }) => {
  const config = getAiConfig();
  // We currently only support OpenAI for images
  if (provider !== 'openai' && provider !== 'mock') {
    // Fallback to OpenAI if configured, or mock
    if (!config.openaiApiKey) return 'https://via.placeholder.com/1024x1024?text=AI+Provider+Not+Configured';
  }

  const resolvedProvider = resolveAiProviderWithConfig(provider, config);

  if (resolvedProvider === 'mock') {
    return 'https://via.placeholder.com/1024x1024?text=Mock+Soul+Portrait';
  }



  return await callOpenAIImage(config, { prompt });
};

export {
  callOpenAI,
  callOpenAIStream,
  callAnthropic,
  callAnthropicStream,
  generateAIContent,
  generateImage,
  resolveAiProvider,
  buildBaziPrompt,
};

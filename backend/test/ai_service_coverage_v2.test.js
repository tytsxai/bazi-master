import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ai from '../services/ai.service.js';

const withEnv = async (patch, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withMockFetch = async (mock, run) => {
  const prev = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = prev;
  }
};

const createStreamResponse = (lines) => {
  const encoder = new TextEncoder();
  let idx = 0;
  const reader = {
    async read() {
      if (idx >= lines.length) return { done: true, value: undefined };
      const value = encoder.encode(lines[idx++]);
      return { done: false, value };
    },
    releaseLock() {},
  };
  return {
    ok: true,
    status: 200,
    async text() {
      return '';
    },
    async json() {
      return {};
    },
    body: {
      getReader() {
        return reader;
      },
    },
  };
};

describe('AI service coverage v2', () => {
  it('resolveAiProvider rejects disabled providers when keys are missing', async () => {
    await withEnv({ OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined }, async () => {
      assert.throws(() => ai.resolveAiProvider('openai'), /not available/i);
      assert.throws(() => ai.resolveAiProvider('anthropic'), /not available/i);
      assert.equal(ai.resolveAiProvider('mock'), 'mock');
    });
  });

  it('callOpenAI / callAnthropic handle ok and error responses', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'dummy-openai',
        ANTHROPIC_API_KEY: 'dummy-anthropic',
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async text() {
              return '';
            },
            async json() {
              return { choices: [{ message: { content: 'hello' } }] };
            },
          }),
          async () => {
            const content = await ai.callOpenAI({ system: 's', user: 'u' });
            assert.equal(content, 'hello');
          }
        );

        await withMockFetch(
          async () => ({
            ok: false,
            status: 401,
            async text() {
              return 'bad';
            },
            async json() {
              return {};
            },
          }),
          async () => {
            await assert.rejects(
              () => ai.callOpenAI({ system: 's', user: 'u' }),
              /OpenAI API error: 401/,
            );
          }
        );

        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async text() {
              return '';
            },
            async json() {
              return { content: [{ text: 'hi from claude' }] };
            },
          }),
          async () => {
            const content = await ai.callAnthropic({ system: 's', user: 'u' });
            assert.equal(content, 'hi from claude');
          }
        );

        await withMockFetch(
          async () => ({
            ok: false,
            status: 500,
            async text() {
              return 'oops';
            },
            async json() {
              return {};
            },
          }),
          async () => {
            await assert.rejects(
              () => ai.callAnthropic({ system: 's', user: 'u' }),
              /Anthropic API error: 500/,
            );
          }
        );
      }
    );
  });

  it('fetchWithTimeout respects disabled/aborting timeouts via callOpenAI', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'dummy-openai',
        AI_TIMEOUT_MS: 0,
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        let sawSignal = 'unset';
        await withMockFetch(
          async (_url, options) => {
            sawSignal = options?.signal ? 'present' : 'absent';
            return {
              ok: true,
              status: 200,
              async text() {
                return '';
              },
              async json() {
                return { choices: [{ message: { content: 'ok' } }] };
              },
            };
          },
          async () => {
            const content = await ai.callOpenAI({ system: 's', user: 'u' });
            assert.equal(content, 'ok');
          }
        );
        assert.equal(sawSignal, 'absent');
      }
    );

    await withEnv(
      {
        OPENAI_API_KEY: 'dummy-openai',
        AI_TIMEOUT_MS: 1,
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        await withMockFetch(
          async (_url, options) =>
            new Promise((_, reject) => {
              options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
          async () => {
            await assert.rejects(
              () => ai.callOpenAI({ system: 's', user: 'u' }),
              /aborted/,
            );
          }
        );
      }
    );
  });

  it('streaming calls emit chunks and ignore parse errors', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'dummy-openai',
        ANTHROPIC_API_KEY: 'dummy-anthropic',
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        await withMockFetch(
          async () =>
            createStreamResponse([
              'data: {invalid}\n\n',
              'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
              'data: [DONE]\n\n',
            ]),
          async () => {
            let out = '';
            await ai.callOpenAIStream({
              system: 's',
              user: 'u',
              onChunk: (c) => {
                out += c;
              },
            });
            assert.equal(out, 'Hello');
          }
        );

        await withMockFetch(
          async () =>
            createStreamResponse([
              'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n',
              'data: {"type":"content_block_delta","delta":{"text":"!"}}\n\n',
              'data: [DONE]\n\n',
            ]),
          async () => {
            let out = '';
            await ai.callAnthropicStream({
              system: 's',
              user: 'u',
              onChunk: (c) => {
                out += c;
              },
            });
            assert.equal(out, 'Hi!');
          }
        );
      }
    );
  });

  it('generateAIContent streams and concatenates result', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'dummy-openai',
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        await withMockFetch(
          async () =>
            createStreamResponse([
              'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
              'data: [DONE]\n\n',
            ]),
          async () => {
            const chunks = [];
            const result = await ai.generateAIContent({
              system: 's',
              user: 'u',
              provider: 'openai',
              onChunk: (c) => chunks.push(c),
            });
            assert.deepEqual(chunks, ['A', 'B']);
            assert.equal(result, 'AB');
          }
        );
      }
    );
  });

  it('generateAIContent supports mock fallbacks (string/function/default) and non-stream branches', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'dummy-openai',
        ANTHROPIC_API_KEY: 'dummy-anthropic',
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        const chunked = [];
        const mock1 = await ai.generateAIContent({
          system: 's',
          user: 'u',
          provider: 'mock',
          fallback: 'hi',
          onChunk: (c) => chunked.push(c),
        });
        assert.equal(mock1, 'hi');
        assert.deepEqual(chunked, ['hi']);

        const mock2 = await ai.generateAIContent({
          system: 's',
          user: 'u',
          provider: 'mock',
          fallback: () => 'from-fn',
        });
        assert.equal(mock2, 'from-fn');

        const mock3 = await ai.generateAIContent({ system: 's', user: 'u', provider: 'mock' });
        assert.match(mock3, /Mock AI response/i);

        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async text() {
              return '';
            },
            async json() {
              return { choices: [{ message: { content: 'openai-non-stream' } }] };
            },
          }),
          async () => {
            const out = await ai.generateAIContent({ system: 's', user: 'u', provider: 'openai' });
            assert.equal(out, 'openai-non-stream');
          }
        );

        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async text() {
              return '';
            },
            async json() {
              return { content: [{ text: 'anthropic-non-stream' }] };
            },
          }),
          async () => {
            const out = await ai.generateAIContent({ system: 's', user: 'u', provider: 'anthropic' });
            assert.equal(out, 'anthropic-non-stream');
          }
        );

        await withMockFetch(
          async () => ({
            ok: false,
            status: 429,
            async text() {
              return 'nope';
            },
          }),
          async () => {
            await assert.rejects(
              () => ai.callOpenAIStream({ system: 's', user: 'u', onChunk: () => {} }),
              /OpenAI API error: 429/,
            );
          }
        );

        await withMockFetch(
          async () => ({
            ok: false,
            status: 400,
            async text() {
              return 'nope';
            },
          }),
          async () => {
            await assert.rejects(
              () => ai.callAnthropicStream({ system: 's', user: 'u', onChunk: () => {} }),
              /Anthropic API error: 400/,
            );
          }
        );
      }
    );
  });
});

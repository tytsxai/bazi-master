import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildBaziPrompt, generateImage } from '../services/ai.service.js';

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

describe('AI service image + prompt coverage', () => {
  it('buildBaziPrompt returns system/user/fallback strings', () => {
    const prompt = buildBaziPrompt({
      pillars: {
        day: { stem: 'Jia', elementStem: 'Wood' },
        month: { stem: 'Yi', branch: 'Chou', elementBranch: 'Earth' },
      },
      fiveElements: { Wood: 2, Fire: 1 },
      tenGods: [
        { name: 'Friend', strength: 2 },
        { name: 'Wealth', strength: 0 },
      ],
      luckCycles: [{ range: '2020-2030', stem: 'Jia', branch: 'Zi' }],
      strength: 'ok',
    });

    assert.equal(typeof prompt.system, 'string');
    assert.equal(typeof prompt.user, 'string');
    assert.equal(typeof prompt.fallback, 'function');
    const fb = prompt.fallback();
    assert.match(fb, /BaZi Insight/i);
    assert.match(fb, /Summary/i);
  });

  it('generateImage returns placeholders when provider is unsupported or mock', async () => {
    await withEnv({ OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: 'x' }, async () => {
      const out = await generateImage({ prompt: 'p', provider: 'anthropic' });
      assert.match(out, /placeholder\.com/);
    });

    await withEnv({ OPENAI_API_KEY: undefined }, async () => {
      const out = await generateImage({ prompt: 'p', provider: 'mock' });
      assert.match(out, /Mock\+Soul\+Portrait/);
    });
  });

  it('generateImage calls OpenAI images endpoint and handles errors', async () => {
    await withEnv({ OPENAI_API_KEY: 'k', AI_TIMEOUT_MS: 0 }, async () => {
      await withMockFetch(
        async () => ({
          ok: true,
          status: 200,
          async text() {
            return '';
          },
          async json() {
            return { data: [{ url: 'http://img' }] };
          },
        }),
        async () => {
          const out = await generateImage({ prompt: 'p', provider: 'openai' });
          assert.equal(out, 'http://img');
        }
      );

      await withMockFetch(
        async () => ({
          ok: false,
          status: 400,
          async text() {
            return 'bad';
          },
          async json() {
            return {};
          },
        }),
        async () => {
          await assert.rejects(
            () => generateImage({ prompt: 'p', provider: 'openai' }),
            /OpenAI Image API error: 400/
          );
        }
      );

      await assert.rejects(
        () => generateImage({ prompt: 'p', provider: 'unknown' }),
        /Unknown AI provider/i
      );
    });
  });
});

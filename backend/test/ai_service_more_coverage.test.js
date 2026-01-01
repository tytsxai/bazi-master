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

describe('AI service more coverage', () => {
  it('callOpenAI / callAnthropic throw when api keys missing', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        RESET_REQUEST_MIN_DURATION_MS: 0,
      },
      async () => {
        await assert.rejects(
          () => ai.callOpenAI({ system: 's', user: 'u' }),
          /OpenAI API key not configured/i
        );
        await assert.rejects(
          () => ai.callAnthropic({ system: 's', user: 'u' }),
          /Anthropic API key not configured/i
        );
      }
    );
  });

  it('resolveAiProvider rejects unknown providers', async () => {
    assert.throws(() => ai.resolveAiProvider('definitely-not-a-provider'), /Unknown AI provider/i);
  });

  it('buildBaziPrompt returns fallback markdown', async () => {
    const { system, user, fallback } = ai.buildBaziPrompt({
      pillars: {
        day: { stem: '甲', elementStem: 'Wood' },
        month: { stem: '乙', branch: '卯', elementBranch: 'Wood' },
      },
      fiveElements: { Wood: 3, Fire: 1 },
      tenGods: [
        { name: 'Friend', strength: 2 },
        { name: 'Wealth', strength: 1 },
      ],
      luckCycles: [{ range: '2020-2030', stem: '丙', branch: '午' }],
      strength: 'Strong',
    });

    assert.equal(typeof system, 'string');
    assert.equal(typeof user, 'string');
    assert.equal(typeof fallback, 'function');
    const out = fallback();
    assert.match(out, /BaZi Insight/);
    assert.match(out, /Summary/);
  });
});

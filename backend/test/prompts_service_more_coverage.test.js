import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBaziPrompt,
  buildZiweiPrompt,
  getChatSystemPrompt,
} from '../services/prompts.service.js';

describe('prompts.service more coverage', () => {
  it('buildBaziPrompt provides prompt + fallback even with partial inputs', () => {
    const out = buildBaziPrompt({
      pillars: {},
      fiveElements: null,
      tenGods: null,
      luckCycles: null,
    });
    assert.equal(typeof out.system, 'string');
    assert.equal(typeof out.user, 'string');
    assert.equal(typeof out.fallback, 'function');
    assert.match(out.user, /Day Master:/);
    assert.match(out.fallback(), /BaZi Insight/i);
  });

  it('buildZiweiPrompt formats chart fields and fallback', () => {
    const out1 = buildZiweiPrompt({ chart: null, birth: null });
    assert.match(out1.user, /Birth: \?-/);
    assert.match(out1.fallback(), /Zi Wei Interpretation/i);

    const out2 = buildZiweiPrompt({
      chart: {
        lunar: { year: 2024, month: 1, day: 2, isLeap: true },
        mingPalace: {
          palace: { cn: '命宫' },
          branch: { name: 'Zi' },
          stars: { major: [{ cn: 'StarA' }, { key: 'StarB' }] },
        },
        shenPalace: {
          palace: { name: '身宫' },
          branch: { name: 'Chou' },
          stars: { major: [{ name: 'StarC' }] },
        },
        fourTransformations: [
          { type: 'huaLu', starCn: '禄' },
          { type: { toUpperCase: () => 'HUAJI' }, starName: 'Ji' },
          { type: null, starKey: 'X' },
        ],
      },
      birth: { birthYear: 2000, birthMonth: 1, birthDay: 2, birthHour: 3, gender: 'm' },
    });
    assert.match(out2.user, /Lunar: 2024年 1月 2日 \(Leap\)/);
    assert.match(out2.user, /Ming Major Stars: StarA, StarB/);
    assert.match(out2.user, /Shen Major Stars: StarC/);
    assert.match(out2.user, /Four Transformations:/);
  });

  it('getChatSystemPrompt covers mode switch', () => {
    assert.match(getChatSystemPrompt('love'), /relationships and love/i);
    assert.match(getChatSystemPrompt('career'), /career strategist/i);
    assert.match(getChatSystemPrompt('wealth'), /financial/i);
    assert.match(getChatSystemPrompt('general'), /BaZi Fortune Assistant/i);
    assert.match(getChatSystemPrompt('unknown'), /BaZi Fortune Assistant/i);
  });
});

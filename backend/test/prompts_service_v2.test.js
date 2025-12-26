import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBaziPrompt, buildZiweiPrompt } from '../services/prompts.service.js';

describe('Prompts Service V2 Coverage', () => {
    it('buildBaziPrompt handles full data', () => {
        const input = {
            pillars: { day: { stem: 'Jia', elementStem: 'Wood' } },
            fiveElements: { Wood: 1 },
            tenGods: [{ name: 'Friend', strength: 10 }],
            luckCycles: [{ range: '10-20', stem: 'A', branch: 'B' }],
            strength: 'Strong'
        };
        const res = buildBaziPrompt(input);
        assert.ok(res.user.includes('Wood: 1'));
        assert.ok(res.user.includes('Friend: 10'));
        assert.ok(res.user.includes('10-20: AB'));

        const fallback = res.fallback();
        assert.ok(fallback.includes('Wood Day Master'));
        assert.ok(fallback.includes('Friend: 10'));
    });

    it('buildBaziPrompt handles missing data', () => {
        const input = {};
        const res = buildBaziPrompt(input);
        assert.ok(res.user.includes('Not provided')); // 5 elements
        // tenGods undefined -> "Not provided"
        assert.ok(res.user.includes('Ten Gods (top):\n- Not provided'));

        const fallback = res.fallback();
        assert.ok(fallback.includes('balanced Day Master'));
    });

    it('buildZiweiPrompt handles full data', () => {
        const input = {
            chart: {
                lunar: { year: 2024 },
                mingPalace: { palace: { name: 'Ming' }, stars: { major: [{ name: 'Star1' }] } },
                shenPalace: { palace: { name: 'Shen' }, stars: { major: [{ name: 'Star2' }] } },
                fourTransformations: [{ type: 'HuaLu', starName: 'Sun' }]
            },
            birth: { birthYear: 2000 }
        };
        const res = buildZiweiPrompt(input);
        assert.ok(res.user.includes('Ming · Unknown'));
        assert.ok(res.user.includes('Star1'));
        assert.ok(res.user.includes('HUALU Sun'));

        const fallback = res.fallback();
        assert.ok(fallback.includes('strengths rooted in the Ming'));
    });

    it('buildZiweiPrompt handles missing data', () => {
        const input = {};
        const res = buildZiweiPrompt(input);
        assert.ok(res.user.includes('Birth: ?-?-?'));
        assert.ok(res.user.includes('Unknown · Unknown')); // Ming/Shen
    });
});

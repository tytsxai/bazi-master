import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getElementRelation,
    calculateTenGod,
    buildPillar,
    performCalculation,
    hasFullBaziResult,
    getBaziCalculation,
    buildImportRecord,
    STEMS_MAP
} from '../services/calculations.service.js';

describe('Calculations Service V2 Coverage', () => {
    it('getElementRelation logic', () => {
        assert.equal(getElementRelation('Wood', 'Wood'), 'Same');
        assert.equal(getElementRelation('Wood', 'Fire'), 'Generates');
        assert.equal(getElementRelation('Fire', 'Wood'), 'GeneratedBy');
        assert.equal(getElementRelation('Wood', 'Earth'), 'Controls');
        assert.equal(getElementRelation('Earth', 'Wood'), 'ControlledBy');
        assert.equal(getElementRelation('Wood', 'Invalid'), 'Unknown');
        assert.equal(getElementRelation('Invalid', 'Wood'), 'Unknown');
    });

    it('calculateTenGod switch cases', () => {
        // Wood (Jia +) vs...
        // Friend: Wood + (Jia)
        assert.ok(calculateTenGod('甲', '甲').includes('Friend'));
        // Rob Wealth: Wood - (Yi)
        assert.ok(calculateTenGod('甲', '乙').includes('Rob Wealth'));
        // Eating God: Fire + (Bing) (Generates Same Polarity)
        assert.ok(calculateTenGod('甲', '丙').includes('Eating God'));
        // Hurting Officer: Fire - (Ding)
        assert.ok(calculateTenGod('甲', '丁').includes('Hurting Officer'));
        // Direct Wealth: Earth - (Ji) (Controls Opp Polarity)
        assert.ok(calculateTenGod('甲', '己').includes('Direct Wealth')); // Wood controls Earth
        // Indirect Wealth: Earth + (Wu)
        assert.ok(calculateTenGod('甲', '戊').includes('Indirect Wealth'));
        // Direct Officer: Metal - (Xin) (ControlledBy Opp)
        assert.ok(calculateTenGod('甲', '辛').includes('Direct Officer')); // Metal controls Wood
        // Seven Killings: Metal + (Geng)
        assert.ok(calculateTenGod('甲', '庚').includes('Seven Killings'));
        // Direct Resource: Water - (Gui) (GeneratedBy Opp)
        assert.ok(calculateTenGod('甲', '癸').includes('Direct Resource')); // Water generates Wood
        // Indirect Resource: Water + (Ren)
        assert.ok(calculateTenGod('甲', '壬').includes('Indirect Resource'));

        assert.equal(calculateTenGod('甲', 'Invalid'), 'Unknown');
    });

    it('buildPillar basic', () => {
        const p = buildPillar('甲', '子'); // Wood, Water
        assert.equal(p.stem, 'Jia');
        assert.equal(p.branch, 'Zi');
        assert.equal(p.elementStem, 'Wood');
    });

    it('performCalculation runs (integration check)', () => {
        const data = { birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 12, gender: 'male' };
        const res = performCalculation(data);
        assert.ok(res.pillars);
        assert.ok(res.fiveElements);
    });

    it('hasFullBaziResult validation', () => {
        assert.equal(hasFullBaziResult(null), false);
        assert.equal(hasFullBaziResult({}), false);
        assert.equal(hasFullBaziResult({ pillars: {}, fiveElements: {}, tenGods: {}, luckCycles: [] }), true);
    });

    it('getBaziCalculation wrappers', async () => {
        const data = { birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 12, gender: 'male' };
        const res = await getBaziCalculation(data, { bypassCache: true }); // Bypss cache
        assert.ok(res.pillars);
    });

    it('buildImportRecord basic', async () => {
        const raw = {
            birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 12, gender: 'male',
            timezoneOffsetMinutes: 480
        };
        const rec = await buildImportRecord(raw, 1);
        assert.ok(rec);
        assert.equal(rec.userId, 1);
        assert.ok(rec.pillars); // Should calculate if missing
    });

    it('buildImportRecord with missing required fields returns null', async () => {
        assert.equal(await buildImportRecord({}, 1), null);
        assert.equal(await buildImportRecord({ birthYear: 1990 }, 1), null);
    });
});

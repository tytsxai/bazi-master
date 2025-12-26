import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    STEMS_MAP,
    BRANCHES_MAP,
    getElementRelation,
    calculateTenGod,
    buildPillar,
    performCalculation,
    hasFullBaziResult
} from '../services/calculations.service.js';

describe('Calculations Service Coverage', () => {
    it('STEMS_MAP has all 10 stems', () => {
        assert.equal(Object.keys(STEMS_MAP).length, 10);
        assert.equal(STEMS_MAP['甲'].element, 'Wood');
    });

    it('BRANCHES_MAP has all 12 branches', () => {
        assert.equal(Object.keys(BRANCHES_MAP).length, 12);
        assert.equal(BRANCHES_MAP['子'].element, 'Water');
    });

    it('getElementRelation calculates correctly', () => {
        assert.equal(getElementRelation('Wood', 'Wood'), 'Same');
        assert.equal(getElementRelation('Wood', 'Fire'), 'Generates');
        assert.equal(getElementRelation('Wood', 'Water'), 'GeneratedBy');
        assert.equal(getElementRelation('Wood', 'Earth'), 'Controls');
        assert.equal(getElementRelation('Wood', 'Metal'), 'ControlledBy');
    });

    it('calculateTenGod calculates correctly', () => {
        // Jia (Wood+) vs Jia (Wood+) = Friend
        assert.equal(calculateTenGod('甲', '甲'), 'Friend (Bi Jian)');
        // Jia (Wood+) vs Yi (Wood-) = Rob Wealth
        assert.equal(calculateTenGod('甲', '乙'), 'Rob Wealth (Jie Cai)');
        // Jia (Wood+) vs Bing (Fire+) = Eating God
        assert.equal(calculateTenGod('甲', '丙'), 'Eating God (Shi Shen)');
        // Jia (Wood+) vs Geng (Metal+) = Seven Killings
        assert.equal(calculateTenGod('甲', '庚'), 'Seven Killings (Qi Sha)');
    });

    it('buildPillar constructs pillar object', () => {
        const pillar = buildPillar('甲', '子');
        assert.equal(pillar.stem, 'Jia');
        assert.equal(pillar.branch, 'Zi');
        assert.equal(pillar.elementStem, 'Wood');
        assert.equal(pillar.elementBranch, 'Water');
    });

    it('performCalculation returns full result for valid data', () => {
        const data = {
            birthYear: 1990,
            birthMonth: 1,
            birthDay: 1,
            birthHour: 12,
            gender: 'male'
        };
        const res = performCalculation(data);
        assert.ok(res.pillars);
        assert.ok(res.fiveElements);
        assert.ok(res.fiveElementsPercent);
        assert.ok(res.tenGods);
        assert.ok(res.luckCycles);
    });

    it('hasFullBaziResult validates result structure', () => {
        assert.equal(!!hasFullBaziResult(null), false);
        assert.equal(!!hasFullBaziResult({}), false);
        assert.equal(!!hasFullBaziResult({ pillars: {}, fiveElements: {}, tenGods: {}, luckCycles: [] }), true);
    });
});

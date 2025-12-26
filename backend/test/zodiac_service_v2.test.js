import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisingSign, buildHoroscope } from '../services/zodiac.service.js';

describe('Zodiac Service V2', () => {
    it('calculateRisingSign works', () => {
        const res = calculateRisingSign({
            birthYear: 1990,
            birthMonth: 1,
            birthDay: 1,
            birthHour: 12,
            latitude: 40,
            longitude: 116
        });
        assert.ok(res.signKey);
    });

    it('buildHoroscope works', () => {
        const sign = { element: 'Fire', keywords: ['k1', 'k2', 'k3'], strengths: ['s1', 's2'] };
        const res = buildHoroscope(sign, 'daily');
        assert.ok(res.overview);
    });
});

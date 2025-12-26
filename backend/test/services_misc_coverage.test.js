import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    setBaziCacheMirror,
    hasBaziCacheMirror,
    setBaziCacheEntry,
    getCachedBaziCalculation,
    getCachedBaziCalculationAsync,
    clearBaziCalculationCache,
    buildBaziCacheKey
} from '../services/cache.service.js';

describe('Misc Services Coverage', () => {
    // --- Cache Service ---
    beforeEach(() => {
        clearBaziCalculationCache();
        setBaziCacheMirror(null);
    });

    it('Cache service handles get/set local', () => {
        const key = '1990-1-1-1-male';
        setBaziCacheEntry(key, { pillars: {}, fiveElements: {} });
        const val = getCachedBaziCalculation(key);
        assert.ok(val);
        assert.ok(val.pillars);
    });

    it('Cache service handles async get with mirror', async () => {
        const key = '1990-1-1-1-female';
        const mockMirror = {
            data: new Map(),
            get: async (k) => mockMirror.data.get(k),
            set: async (k, v) => mockMirror.data.set(k, v),
            delete: async (k) => mockMirror.data.delete(k)
        };
        setBaziCacheMirror(mockMirror);
        assert.equal(hasBaziCacheMirror(), true);

        // Set in mirror
        await mockMirror.set(key, { pillars: { year: '庚午' }, fiveElements: {} });

        // Get async should fetch from mirror and populate local
        const val = await getCachedBaziCalculationAsync(key);
        assert.equal(val.pillars.year, '庚午');

        // Verify local population
        const local = getCachedBaziCalculation(key);
        assert.ok(local);
    });

    it('buildBaziCacheKey handles invalid input', () => {
        assert.equal(buildBaziCacheKey(null), null);
        assert.equal(buildBaziCacheKey({}), null);
        assert.equal(buildBaziCacheKey({ birthYear: 1990 }), null); // missing fields
    });
});

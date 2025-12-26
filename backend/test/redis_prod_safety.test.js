import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { initRedis, resetRedisState } from '../config/redis.js';

describe('Redis Production Safety', () => {
    const originalEnv = { ...process.env };
    // Mock logger to suppress output during tests
    const mockLogger = { log: () => { }, warn: () => { }, error: () => { } };

    beforeEach(() => {
        resetRedisState();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        mock.restoreAll();
    });

    it('should throw error in production if REDIS_URL is missing', async () => {
        process.env.NODE_ENV = 'production';
        process.env.CI = ''; // Ensure CI is falsy
        delete process.env.REDIS_URL;

        await assert.rejects(
            async () => initRedis({ env: process.env }),
            { message: 'REDIS_URL is required for production sessions.' }
        );
    });

    it('should NOT throw error in development if REDIS_URL is missing', async () => {
        process.env.NODE_ENV = 'development';
        delete process.env.REDIS_URL;

        const result = await initRedis({ env: process.env });
        assert.strictEqual(result, null);
    });

    it('should NOT throw error in production if REDIS_URL is present', async () => {
        process.env.NODE_ENV = 'production';
        process.env.REDIS_URL = 'redis://localhost:6379';

        // Mock importRedis to avoid actual connection
        const mockConnect = mock.fn(async () => { });
        const mockOn = mock.fn();
        const mockImportRedis = async () => ({
            createClient: () => ({
                connect: mockConnect,
                on: mockOn
            })
        });

        const result = await initRedis({
            env: process.env,
            importRedis: mockImportRedis,
            logger: mockLogger
        });

        assert.notStrictEqual(result, null);
        assert.strictEqual(mockConnect.mock.callCount(), 1);
    });
});

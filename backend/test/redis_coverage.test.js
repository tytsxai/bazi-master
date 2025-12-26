import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initRedis, createRedisMirror } from '../config/redis.js';

describe('Redis Configuration', () => {
    it('initRedis returns null if disabled', async () => {
        // Mock ENV if needed or rely on default
        const client = await initRedis({ require: false });
        // It might be null if REDIS_URL is unset
        if (!process.env.REDIS_URL) {
            assert.equal(client, null);
        }
    });

    it('createRedisMirror returns interface', () => {
        const mockClient = { get: async () => 'val', set: async () => { }, del: async () => { } };
        const mirror = createRedisMirror(mockClient);
        assert.equal(typeof mirror.get, 'function');
        assert.equal(typeof mirror.set, 'function');
    });
});

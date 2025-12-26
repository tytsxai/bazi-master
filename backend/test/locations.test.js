import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';

describe('GET /api/locations', () => {
    it('returns empty array if search term is too short', async () => {
        const res = await request(app)
            .get('/api/locations?search=a')
            .expect(200);

        assert.ok(Array.isArray(res.body));
        assert.equal(res.body.length, 0);
    });

    it('returns dummy locations if search term is valid', async () => {
        const res = await request(app)
            .get('/api/locations?search=New')
            .expect(200);

        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.length > 0);
        assert.ok(res.body[0].name.includes('New'));
        assert.ok(res.body[0].timezone);
    });

    it('returns 404 for unknown route', async () => {
        await request(app)
            .get('/api/locations/unknown')
            .expect(404);
    });
});

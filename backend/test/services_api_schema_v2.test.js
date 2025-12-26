import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApiSpec } from '../services/apiSchema.service.js';

describe('Schema Service Coverage V2', () => {
    it('buildOpenApiSpec generates spec', () => {
        const spec = buildOpenApiSpec({ baseUrl: 'http://test.com' });
        assert.equal(spec.openapi, '3.0.3');
        assert.ok(spec.info);
        assert.ok(spec.components);
        assert.equal(spec.servers[0].url, 'http://test.com');
    });
});

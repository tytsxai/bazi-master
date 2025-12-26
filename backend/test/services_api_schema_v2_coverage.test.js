import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApiSpec } from '../services/apiSchema.service.js';

describe('API Schema Service Coverage', () => {
    it('buildOpenApiSpec returns valid spec', () => {
        const spec = buildOpenApiSpec({ baseUrl: 'http://test.com' });
        assert.ok(spec.openapi);
        assert.equal(spec.openapi, '3.0.3');
        assert.ok(spec.paths['/health']);
        assert.ok(spec.components.schemas.Error);
        // Deep check to ensure lazy evaulation or object access counts as coverage
        // Accessing deep properties
        const userSchema = spec.components.schemas.BaziRecord;
        assert.ok(userSchema);
    });
});

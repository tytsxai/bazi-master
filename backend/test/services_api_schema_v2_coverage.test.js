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

    // Access deep properties to ensure coverage over nested schemas.
    assert.ok(spec.components.schemas.BaziRecord);

    // New schemas
    assert.ok(spec.components.schemas.AdminHealth);
    assert.ok(spec.components.schemas.IchingRecord);
    assert.ok(spec.components.schemas.TarotRecord);

    // New paths
    assert.ok(spec.paths['/api/admin/health']);
    assert.ok(spec.paths['/api/iching/history']);
  });
});

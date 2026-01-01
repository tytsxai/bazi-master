import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabase, checkRedis } from '../services/health.service.js';

describe('Health Service V2', () => {
  it('checkDatabase runs', async () => {
    // Mock ENV or prisma handling?
    // It uses global prisma. It might fail connection but shouldn't crash.
    const res = await checkDatabase();
    // Result is { ok, error? }
    assert.ok(typeof res.ok === 'boolean');
  });

  it('checkRedis runs', async () => {
    const res = await checkRedis();
    assert.ok(typeof res.ok === 'boolean');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectMetrics, createMetricsHandler } from '../services/metrics.service.js';

const healthOk = async () => ({
  checks: { db: { ok: true }, redis: { ok: true } },
  ok: true,
});

const collectWith = (overrides = {}) =>
  collectMetrics({
    healthSnapshotFn: healthOk,
    shuttingDownFn: () => false,
    rateLimitDegradedFn: () => false,
    processRef: {
      uptime: () => 123,
      memoryUsage: () => ({ rss: 1000, heapUsed: 500 }),
    },
    ...overrides,
  });

const createRes = () => ({
  statusCode: null,
  body: null,
  headers: new Map(),
  set(name, value) {
    this.headers.set(name, value);
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
});

describe('metrics collection', () => {
  it('emits the process gauges in Prometheus text format', async () => {
    const body = await collectWith();

    assert.match(body, /^# HELP bazi_up /m);
    assert.match(body, /^# TYPE bazi_up gauge$/m);
    assert.match(body, /^bazi_up 1$/m);
    assert.match(body, /^bazi_uptime_seconds 123$/m);
    assert.match(body, /^bazi_process_resident_memory_bytes 1000$/m);
    assert.match(body, /^bazi_process_heap_used_bytes 500$/m);
    assert.match(body, /^bazi_shutting_down 0$/m);
    assert.ok(body.endsWith('\n'));
  });

  it('declares HELP/TYPE exactly once for the multi-series dependency gauge', async () => {
    const body = await collectWith();

    assert.equal((body.match(/^# HELP bazi_dependency_up /gm) || []).length, 1);
    assert.equal((body.match(/^# TYPE bazi_dependency_up /gm) || []).length, 1);
    assert.match(body, /^bazi_dependency_up\{dependency="db"\} 1$/m);
    assert.match(body, /^bazi_dependency_up\{dependency="redis"\} 1$/m);
  });

  // The series are driven by whatever getHealthSnapshot reports, so adding or dropping a
  // dependency there must not need a matching edit in the metrics service.
  it('follows the checks dictionary rather than a hardcoded dependency list', async () => {
    const body = await collectWith({
      healthSnapshotFn: async () => ({ checks: { redis: { ok: true } }, ok: true }),
    });

    assert.match(body, /^bazi_dependency_up\{dependency="redis"\} 1$/m);
    assert.ok(!body.includes('dependency="db"'));
    assert.equal((body.match(/^# HELP bazi_dependency_up /gm) || []).length, 1);
  });

  it('omits the dependency family entirely when nothing is reported', async () => {
    const body = await collectWith({
      healthSnapshotFn: async () => ({ checks: {}, ok: true }),
    });

    assert.ok(!body.includes('bazi_dependency_up'));
    assert.match(body, /^bazi_up 1$/m);
  });

  it('reports a dependency that is down', async () => {
    const body = await collectWith({
      healthSnapshotFn: async () => ({
        checks: { db: { ok: false, error: 'boom' }, redis: { ok: false, status: 'unavailable' } },
        ok: false,
      }),
    });

    assert.match(body, /^bazi_dependency_up\{dependency="db"\} 0$/m);
    assert.match(body, /^bazi_dependency_up\{dependency="redis"\} 0$/m);
  });

  // Not configured is healthy; configured-but-unreachable is not. Reporting "disabled" as
  // a failure would leave a deployment without Redis permanently degraded.
  it('counts a deliberately disabled dependency as up', async () => {
    const body = await collectWith({
      healthSnapshotFn: async () => ({
        checks: { redis: { ok: true, status: 'disabled' } },
        ok: true,
      }),
    });

    assert.match(body, /^bazi_dependency_up\{dependency="redis"\} 1$/m);
  });

  it('surfaces draining and rate-limit degradation', async () => {
    const body = await collectWith({
      shuttingDownFn: () => true,
      rateLimitDegradedFn: () => true,
    });

    assert.match(body, /^bazi_shutting_down 1$/m);
    assert.match(body, /^bazi_rate_limit_degraded 1$/m);
  });
});

describe('metrics endpoint auth', () => {
  const collect = async () => 'bazi_up 1\n';

  it('404s in production when no token is configured', async () => {
    const handler = createMetricsHandler({ env: { NODE_ENV: 'production' }, collect });
    const res = createRes();

    await handler({ headers: {} }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  it('serves unauthenticated outside production when no token is configured', async () => {
    const handler = createMetricsHandler({ env: { NODE_ENV: 'development' }, collect });
    const res = createRes();

    await handler({ headers: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'bazi_up 1\n');
    assert.equal(res.headers.get('Content-Type'), 'text/plain; version=0.0.4; charset=utf-8');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });

  it('requires a bearer token once one is configured', async () => {
    const env = { NODE_ENV: 'production', METRICS_TOKEN: 'sekret' };

    for (const headers of [{}, { authorization: 'Bearer' }, { authorization: 'Bearer wrong' }]) {
      const res = createRes();
      await createMetricsHandler({ env, collect })({ headers }, res);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Unauthorized' });
    }
  });

  it('accepts the configured bearer token', async () => {
    const handler = createMetricsHandler({
      env: { NODE_ENV: 'production', METRICS_TOKEN: 'sekret' },
      collect,
    });
    const res = createRes();

    await handler({ headers: { authorization: 'Bearer sekret' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'bazi_up 1\n');
  });

  // Hashing before comparing is what keeps timingSafeEqual from throwing on a length
  // mismatch, so a token of a different length must be rejected, not blow up.
  it('rejects a token of a different length without throwing', async () => {
    const handler = createMetricsHandler({
      env: { NODE_ENV: 'production', METRICS_TOKEN: 'sekret' },
      collect,
    });
    const res = createRes();

    await handler({ headers: { authorization: 'Bearer much-longer-than-the-real-one' } }, res);

    assert.equal(res.statusCode, 401);
  });
});

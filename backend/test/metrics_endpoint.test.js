import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectMetrics, createMetricsHandler } from '../services/metrics.service.js';

const healthOk = async () => ({ db: { ok: true }, redis: { ok: true }, ok: true });
const wsOk = () => ({
  status: 'ok',
  totalConnections: 7,
  maxConnections: 500,
  activeAiRequests: 2,
});

const collectWith = (overrides = {}) =>
  collectMetrics({
    healthSnapshotFn: healthOk,
    websocketMetricsFn: wsOk,
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
  it('emits the gauges an alert needs, in Prometheus text format', async () => {
    const body = await collectWith();

    assert.match(body, /^# HELP bazi_up /m);
    assert.match(body, /^# TYPE bazi_up gauge$/m);
    assert.match(body, /^bazi_up 1$/m);
    assert.match(body, /^bazi_uptime_seconds 123$/m);
    assert.match(body, /^bazi_process_resident_memory_bytes 1000$/m);
    assert.match(body, /^bazi_process_heap_used_bytes 500$/m);
    assert.match(body, /^bazi_shutting_down 0$/m);
    // The pair the TODO asks for an alert on: ratio, not "wait until it starts refusing".
    assert.match(body, /^bazi_websocket_connections 7$/m);
    assert.match(body, /^bazi_websocket_connections_max 500$/m);
    assert.match(body, /^bazi_websocket_ai_requests_active 2$/m);
    assert.ok(body.endsWith('\n'));
  });

  it('declares HELP/TYPE exactly once for the multi-series dependency gauge', async () => {
    const body = await collectWith();

    assert.equal((body.match(/^# HELP bazi_dependency_up /gm) || []).length, 1);
    assert.equal((body.match(/^# TYPE bazi_dependency_up /gm) || []).length, 1);
    assert.match(body, /^bazi_dependency_up\{dependency="database"\} 1$/m);
    assert.match(body, /^bazi_dependency_up\{dependency="redis"\} 1$/m);
  });

  it('reports a dependency that is down', async () => {
    const body = await collectWith({
      healthSnapshotFn: async () => ({
        db: { ok: false, error: 'boom' },
        redis: { ok: false, status: 'unavailable' },
        ok: false,
      }),
    });

    assert.match(body, /^bazi_dependency_up\{dependency="database"\} 0$/m);
    assert.match(body, /^bazi_dependency_up\{dependency="redis"\} 0$/m);
  });

  it('counts a deliberately disabled redis as up', async () => {
    const body = await collectWith({
      healthSnapshotFn: async () => ({
        db: { ok: true },
        redis: { ok: true, status: 'disabled' },
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

  // Zeros would read as "no connections" rather than "the server was never started".
  it('omits websocket gauges when the ws server is not initialised', async () => {
    const body = await collectWith({ websocketMetricsFn: () => ({ status: 'not_initialized' }) });

    assert.ok(!body.includes('bazi_websocket_connections'));
    assert.match(body, /^bazi_up 1$/m);
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

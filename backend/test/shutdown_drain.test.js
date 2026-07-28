import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import {
  beginShutdown,
  isShuttingDown,
  resetLifecycle,
  resolveDrainMs,
} from '../services/lifecycle.service.js';

describe('Shutdown drain', () => {
  afterEach(() => {
    resetLifecycle();
  });

  it('starts out not shutting down', () => {
    assert.equal(isShuttingDown(), false);
  });

  describe('resolveDrainMs', () => {
    it('defaults to 5s in production so a load balancer has time to notice', () => {
      assert.equal(resolveDrainMs({ NODE_ENV: 'production' }), 5000);
    });

    it('defaults to 0 outside production, where the delay is just a slow Ctrl-C', () => {
      assert.equal(resolveDrainMs({ NODE_ENV: 'development' }), 0);
      assert.equal(resolveDrainMs({}), 0);
    });

    it('honours an explicit value, including 0 to disable draining', () => {
      assert.equal(resolveDrainMs({ NODE_ENV: 'production', SHUTDOWN_DRAIN_MS: '12000' }), 12000);
      assert.equal(resolveDrainMs({ NODE_ENV: 'production', SHUTDOWN_DRAIN_MS: '0' }), 0);
    });

    it('falls back to the default for values that are not usable', () => {
      assert.equal(resolveDrainMs({ NODE_ENV: 'production', SHUTDOWN_DRAIN_MS: '' }), 5000);
      assert.equal(resolveDrainMs({ NODE_ENV: 'production', SHUTDOWN_DRAIN_MS: 'soon' }), 5000);
      assert.equal(resolveDrainMs({ NODE_ENV: 'production', SHUTDOWN_DRAIN_MS: '-1' }), 5000);
    });
  });

  describe('readiness probes', () => {
    // The point of the drain: these must fail while the process is still accepting and
    // completing requests, so traffic is steered away before the socket closes.
    it('/api/ready reports 503 once shutdown has begun', async () => {
      // Asserts on the status string rather than the code: before shutdown the probe may
      // legitimately be 200 or 503 depending on whether the database is reachable, but
      // only the drain path can produce "shutting_down".
      const before = await request(app).get('/api/ready');
      assert.notEqual(before.body.status, 'shutting_down');

      beginShutdown();

      const during = await request(app).get('/api/ready');
      assert.equal(during.status, 503);
      assert.equal(during.body.status, 'shutting_down');
    });

    it('/health and /api/health report 503 once shutdown has begun', async () => {
      beginShutdown();

      const health = await request(app).get('/health');
      assert.equal(health.status, 503);
      assert.equal(health.body.status, 'shutting_down');

      const apiHealth = await request(app).get('/api/health');
      assert.equal(apiHealth.status, 503);
      assert.equal(apiHealth.body.status, 'shutting_down');
    });

    // /live drives the container healthcheck, which drives autoheal. If it failed during
    // a drain the orchestrator would restart a container that is already shutting down.
    it('/live keeps reporting 200 during shutdown', async () => {
      beginShutdown();

      const live = await request(app).get('/live');
      assert.equal(live.status, 200);
      assert.equal(live.body.status, 'alive');

      const apiLive = await request(app).get('/api/live');
      assert.equal(apiLive.status, 200);
    });

    it('still serves ordinary requests while draining', async () => {
      beginShutdown();

      // An in-flight request must not be refused just because the drain has started —
      // that would defeat the whole purpose of draining rather than closing outright.
      const res = await request(app).get('/api/does-not-exist');
      assert.equal(res.status, 404);
    });
  });
});

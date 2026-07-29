import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  initRedisMirrors,
  setupGracefulShutdown,
  startServer,
  validateProductionConfig,
} from '../server.js';

const CLEAN_PROD_ENV = {
  CORS_ALLOWED_ORIGINS: 'https://client.example.com',
  BACKEND_BASE_URL: 'https://api.example.com',
  DOCS_PASSWORD: 'docs-pass',
  REDIS_URL: 'redis://localhost:6379',
  METRICS_TOKEN: 'scrape-token',
  SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
  TRUST_PROXY: '1',
};

describe('server startup coverage', () => {
  it('validateProductionConfig accepts a fully configured environment', () => {
    const { errors, warnings } = validateProductionConfig({ env: { ...CLEAN_PROD_ENV } });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('treats only DOCS_PASSWORD as fatal on an empty environment', () => {
    const { errors, warnings } = validateProductionConfig({ env: {} });

    // Everything else degrades rather than breaks, so refusing to boot over it would be a
    // self-inflicted outage. Assert the exact set: a new hard error must be a deliberate
    // decision, not something that slipped in.
    assert.deepEqual(errors, [
      'DOCS_PASSWORD must be configured in production; /api-docs is unusable without it',
    ]);
    assert.ok(warnings.some((w) => w.includes('CORS_ALLOWED_ORIGINS')));
    assert.ok(warnings.some((w) => w.includes('REDIS_URL')));
    assert.ok(warnings.some((w) => w.includes('METRICS_TOKEN')));
    assert.ok(warnings.some((w) => w.includes('TRUST_PROXY')));
  });

  it('a missing Redis is a warning, not an error', () => {
    const env = { ...CLEAN_PROD_ENV };
    delete env.REDIS_URL;

    const { errors, warnings } = validateProductionConfig({ env });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('results stay correct'));
  });

  it('allows a localhost BACKEND_BASE_URL only behind ALLOW_LOCALHOST_PROD', () => {
    const base = { ...CLEAN_PROD_ENV, BACKEND_BASE_URL: 'http://localhost:4000' };

    assert.equal(validateProductionConfig({ env: base }).warnings.length, 1);
    assert.deepEqual(
      validateProductionConfig({ env: { ...base, ALLOW_LOCALHOST_PROD: 'true' } }).warnings,
      []
    );
  });

  it('initRedisMirrors no-ops when initRedis returns null', async () => {
    let setBaziMirrorCalls = 0;

    await initRedisMirrors({
      require: false,
      initRedisFn: async () => null,
      createRedisMirrorFn: () => ({ mirror: true }),
      setBaziCacheMirrorFn() {
        setBaziMirrorCalls++;
      },
      loggerInstance: {
        info() {
          throw new Error('should not log');
        },
      },
    });

    assert.equal(setBaziMirrorCalls, 0);
  });

  it('initRedisMirrors wires the calculation cache mirror when a client exists', async () => {
    const calls = [];
    const fakeClient = { ok: true };

    await initRedisMirrors({
      require: false,
      initRedisFn: async ({ require }) => {
        calls.push(['initRedis', require]);
        return fakeClient;
      },
      createRedisMirrorFn: (client, opts) => {
        calls.push(['createMirror', client, opts.prefix, opts.ttlMs]);
        return { prefix: opts.prefix };
      },
      setBaziCacheMirrorFn(mirror) {
        calls.push(['setBaziMirror', mirror.prefix]);
      },
      loggerInstance: {
        info(msg) {
          calls.push(['info', msg]);
        },
      },
      baziCacheTtlMs: 456,
    });

    assert.deepEqual(calls[0], ['initRedis', false]);
    // The calculation cache is the only mirror left; session, OAuth state, reset-token and
    // credential-revocation mirrors went with the subsystems that needed them.
    const mirrors = calls.filter((c) => c[0] === 'createMirror');
    assert.deepEqual(
      mirrors.map((c) => c[2]),
      ['bazi-cache:']
    );
    assert.equal(mirrors[0][3], 456);
    assert.ok(calls.some((c) => c[0] === 'setBaziMirror' && c[1] === 'bazi-cache:'));
    assert.ok(calls.some((c) => c[0] === 'info'));
  });

  it('setupGracefulShutdown registers handlers and exits after closing', async () => {
    const registered = new Map();
    const exits = [];
    const logs = [];

    const processRef = {
      env: { GRACEFUL_SHUTDOWN_TIMEOUT_MS: '50' },
      exitCode: 0,
      once(signal, handler) {
        registered.set(signal, handler);
      },
      // unhandledRejection is registered with `on` (and no longer terminates the
      // process), so the stub needs both registration methods.
      on(signal, handler) {
        registered.set(signal, handler);
      },
      exit(code) {
        exits.push(code);
      },
    };

    const serverRef = {
      close(cb) {
        cb();
      },
    };

    const loggerInstance = {
      info(metaOrMsg, maybeMsg) {
        logs.push(['info', metaOrMsg, maybeMsg]);
      },
      error(metaOrMsg, maybeMsg) {
        logs.push(['error', metaOrMsg, maybeMsg]);
      },
    };

    setupGracefulShutdown(serverRef, { loggerInstance, processRef });
    assert.equal(typeof registered.get('SIGTERM'), 'function');
    assert.equal(typeof registered.get('SIGINT'), 'function');

    await registered.get('SIGTERM')();
    assert.deepEqual(exits, [0]);
    assert.ok(
      logs.some(
        (entry) =>
          entry[2] === 'Graceful shutdown complete.' || entry[1] === 'Graceful shutdown complete.'
      )
    );
  });

  it('startServer exits on production config errors without listening', async () => {
    const exits = [];

    await startServer({
      appConfigValue: { IS_PRODUCTION: true, PORT: 123 },
      serverInstance: {
        listen() {
          throw new Error('should not listen');
        },
      },
      initRedisMirrorsFn: async () => {
        throw new Error('should not init redis');
      },
      loggerInstance: { warn() {}, error() {}, fatal() {}, info() {} },
      processRef: {
        env: {},
        exit(code) {
          exits.push(code);
        },
        once() {},
        on() {},
        exitCode: 0,
      },
    });

    assert.deepEqual(exits, [1]);
  });

  // Redis backs a cache, not correctness. Refusing to boot without it would turn a slower
  // service into no service at all — so a failure here is logged and the server listens.
  it('startServer still listens when the redis mirror fails to initialise', async () => {
    const exits = [];
    const listens = [];
    const errors = [];

    await startServer({
      appConfigValue: { IS_PRODUCTION: false, PORT: 123 },
      serverInstance: {
        listen(port, host, cb) {
          listens.push([port, host]);
          cb();
        },
      },
      initRedisMirrorsFn: async () => {
        throw new Error('redis down');
      },
      loggerInstance: {
        warn() {},
        error(meta, msg) {
          errors.push(msg);
        },
        fatal() {},
        info() {},
      },
      processRef: {
        env: {},
        exit(code) {
          exits.push(code);
        },
        once() {},
        on() {},
        exitCode: 0,
      },
    });

    assert.deepEqual(exits, []);
    assert.deepEqual(listens, [[123, '127.0.0.1']]);
    assert.ok(errors.some((msg) => String(msg).includes('per-process cache')));
  });

  it('startServer listens with resolved bindHost on success', async () => {
    const exits = [];
    const listens = [];
    const infos = [];

    await startServer({
      appConfigValue: { IS_PRODUCTION: false, PORT: 555 },
      serverInstance: {
        listen(port, host, cb) {
          listens.push([port, host]);
          cb();
        },
      },
      initRedisMirrorsFn: async () => {},
      loggerInstance: {
        warn() {},
        error() {},
        fatal() {},
        info(msg) {
          infos.push(msg);
        },
      },
      processRef: {
        env: {},
        exit(code) {
          exits.push(code);
        },
        once() {},
        on() {},
        exitCode: 0,
      },
    });

    assert.deepEqual(exits, []);
    assert.deepEqual(listens, [[555, '127.0.0.1']]);
    assert.ok(infos.some((msg) => String(msg).includes('http://127.0.0.1:555')));
  });
});

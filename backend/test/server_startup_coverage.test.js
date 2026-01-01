import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  initRedisMirrors,
  setupGracefulShutdown,
  startServer,
  validateProductionConfig,
} from '../server.js';

describe('server startup coverage', () => {
  it('validateProductionConfig returns expected errors/warnings', () => {
    {
      const { errors, warnings } = validateProductionConfig({ env: {} });
      assert.ok(errors.length >= 3);
      assert.ok(warnings.length >= 2);
    }

    {
      const { errors, warnings } = validateProductionConfig({
        env: {
          SESSION_TOKEN_SECRET: 'x'.repeat(32),
          DATABASE_URL: 'postgresql://example/db',
          REDIS_URL: 'redis://localhost:6379',
          FRONTEND_URL: 'https://example.com',
          BACKEND_BASE_URL: 'https://api.example.com',
          ADMIN_EMAILS: 'admin@example.com',
          DOCS_PASSWORD: 'docs-pass',
          SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
          SMTP_HOST: 'smtp.example.com',
          SMTP_FROM: 'noreply@example.com',
          TRUST_PROXY: '1',
        },
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, []);
    }
  });

  it('initRedisMirrors no-ops when initRedis returns null', async () => {
    let setMirrorCalls = 0;
    let setBaziMirrorCalls = 0;
    let setResetTokenMirrorCalls = 0;
    let setOauthStateMirrorCalls = 0;

    await initRedisMirrors({
      require: false,
      initRedisFn: async () => null,
      createRedisMirrorFn: () => ({ mirror: true }),
      sessionStoreRef: {
        setMirror() {
          setMirrorCalls++;
        },
      },
      setBaziCacheMirrorFn() {
        setBaziMirrorCalls++;
      },
      setResetTokenMirrorsFn() {
        setResetTokenMirrorCalls++;
      },
      setOauthStateMirrorFn() {
        setOauthStateMirrorCalls++;
      },
      loggerInstance: {
        info() {
          throw new Error('should not log');
        },
      },
    });

    assert.equal(setMirrorCalls, 0);
    assert.equal(setBaziMirrorCalls, 0);
    assert.equal(setResetTokenMirrorCalls, 0);
    assert.equal(setOauthStateMirrorCalls, 0);
  });

  it('initRedisMirrors wires mirrors when client exists', async () => {
    const calls = [];
    const fakeClient = { ok: true };

    await initRedisMirrors({
      require: true,
      initRedisFn: async ({ require }) => {
        calls.push(['initRedis', require]);
        return fakeClient;
      },
      createRedisMirrorFn: (client, opts) => {
        calls.push(['createMirror', client, opts.prefix, opts.ttlMs]);
        return { prefix: opts.prefix };
      },
      sessionStoreRef: {
        setMirror(mirror) {
          calls.push(['setSessionMirror', mirror.prefix]);
        },
      },
      setBaziCacheMirrorFn(mirror) {
        calls.push(['setBaziMirror', mirror.prefix]);
      },
      setResetTokenMirrorsFn({ tokenMirror, userMirror }) {
        calls.push(['setResetTokenMirrors', tokenMirror.prefix, userMirror.prefix]);
      },
      setOauthStateMirrorFn(mirror) {
        calls.push(['setOauthStateMirror', mirror.prefix]);
      },
      loggerInstance: {
        info(msg) {
          calls.push(['info', msg]);
        },
      },
      sessionIdleMs: 123,
      baziCacheTtlMs: 456,
    });

    assert.deepEqual(calls[0], ['initRedis', true]);
    assert.ok(calls.some((c) => c[0] === 'createMirror' && c[2] === 'session:' && c[3] === 123));
    assert.ok(calls.some((c) => c[0] === 'createMirror' && c[2] === 'bazi-cache:' && c[3] === 456));
    assert.ok(calls.some((c) => c[0] === 'createMirror' && c[2] === 'reset-token:'));
    assert.ok(calls.some((c) => c[0] === 'createMirror' && c[2] === 'reset-token-user:'));
    assert.ok(calls.some((c) => c[0] === 'createMirror' && c[2] === 'oauth-state:'));
    assert.ok(calls.some((c) => c[0] === 'setSessionMirror' && c[1] === 'session:'));
    assert.ok(calls.some((c) => c[0] === 'setBaziMirror' && c[1] === 'bazi-cache:'));
    assert.ok(
      calls.some(
        (c) =>
          c[0] === 'setResetTokenMirrors' &&
          c[1] === 'reset-token:' &&
          c[2] === 'reset-token-user:'
      )
    );
    assert.ok(calls.some((c) => c[0] === 'setOauthStateMirror' && c[1] === 'oauth-state:'));
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
      exit(code) {
        exits.push(code);
      },
    };

    const serverRef = {
      close(cb) {
        cb();
      },
    };

    const prismaClient = {
      async $disconnect() {
        logs.push(['disconnect']);
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

    setupGracefulShutdown(serverRef, { loggerInstance, prismaClient, processRef });
    assert.equal(typeof registered.get('SIGTERM'), 'function');
    assert.equal(typeof registered.get('SIGINT'), 'function');

    await registered.get('SIGTERM')();
    assert.deepEqual(exits, [0]);
    assert.ok(logs.some((entry) => entry[0] === 'disconnect'));
  });

  it('startServer exits on production config errors without connecting', async () => {
    const exits = [];

    await startServer({
      appConfigValue: { IS_PRODUCTION: true, PORT: 123 },
      serverInstance: {
        listen() {
          throw new Error('should not listen');
        },
      },
      prismaClient: {
        async $connect() {
          throw new Error('should not connect');
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
        exitCode: 0,
      },
    });

    assert.deepEqual(exits, [1]);
  });

  it('startServer exits on prisma connection error', async () => {
    const exits = [];
    await startServer({
      appConfigValue: { IS_PRODUCTION: false, PORT: 123 },
      serverInstance: {
        listen() {
          throw new Error('should not listen');
        },
      },
      prismaClient: {
        async $connect() {
          throw new Error('db down');
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
        exitCode: 0,
      },
    });
    assert.deepEqual(exits, [1]);
  });

  it('startServer exits on redis init error', async () => {
    const exits = [];
    await startServer({
      appConfigValue: { IS_PRODUCTION: false, PORT: 123 },
      serverInstance: {
        listen() {
          throw new Error('should not listen');
        },
      },
      prismaClient: { async $connect() {} },
      initRedisMirrorsFn: async () => {
        throw new Error('redis down');
      },
      loggerInstance: { warn() {}, error() {}, fatal() {}, info() {} },
      processRef: {
        env: {},
        exit(code) {
          exits.push(code);
        },
        once() {},
        exitCode: 0,
      },
    });
    assert.deepEqual(exits, [1]);
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
      prismaClient: { async $connect() {} },
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
        exitCode: 0,
      },
    });

    assert.deepEqual(exits, []);
    assert.deepEqual(listens, [[555, '127.0.0.1']]);
    assert.ok(infos.some((msg) => String(msg).includes('http://127.0.0.1:555')));
  });
});

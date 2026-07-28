import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { initWebsocketServer, closeWebsocketServer } from '../services/websocket.service.js';

const startServer = async () => {
  const server = http.createServer((req, res) => res.end('ok'));
  initWebsocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
};

const openSocket = (port) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ai`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => {
      reject(Object.assign(new Error('unexpected-response'), { statusCode: res.statusCode }));
    });
  });

describe('WebSocket connection cap', () => {
  const originalMax = process.env.WS_MAX_CONNECTIONS;
  let running = null;
  let openSockets = [];

  afterEach(async () => {
    openSockets.forEach((ws) => {
      try {
        ws.terminate();
      } catch {
        // already gone
      }
    });
    openSockets = [];
    closeWebsocketServer();
    if (running) {
      await new Promise((resolve) => running.server.close(resolve));
      running = null;
    }
    if (originalMax === undefined) {
      delete process.env.WS_MAX_CONNECTIONS;
    } else {
      process.env.WS_MAX_CONNECTIONS = originalMax;
    }
  });

  // The /ws/ai upgrade is handled before Express, so it never passes through the HTTP
  // rate limiter. Without this ceiling, sockets can be opened until the container OOMs.
  it('refuses the upgrade with 503 once the ceiling is reached', async () => {
    process.env.WS_MAX_CONNECTIONS = '2';
    running = await startServer();

    openSockets.push(await openSocket(running.port));
    openSockets.push(await openSocket(running.port));

    await assert.rejects(
      () => openSocket(running.port),
      (error) => {
        // A proper HTTP response rather than a bare socket reset, so a legitimate client
        // can tell "server is full, retry" from "something crashed".
        assert.equal(error.statusCode, 503);
        return true;
      }
    );
  });

  it('accepts new connections again after existing ones close', async () => {
    process.env.WS_MAX_CONNECTIONS = '1';
    running = await startServer();

    const first = await openSocket(running.port);
    await assert.rejects(() => openSocket(running.port));

    await new Promise((resolve) => {
      first.once('close', resolve);
      first.close();
    });

    const second = await openSocket(running.port);
    openSockets.push(second);
    assert.equal(second.readyState, WebSocket.OPEN);
  });

  it('falls back to the default ceiling for unusable values', async () => {
    for (const value of ['', 'lots', '0', '-1']) {
      process.env.WS_MAX_CONNECTIONS = value;
      running = await startServer();
      // The default is 500, so a single connection must still be accepted.
      const ws = await openSocket(running.port);
      openSockets.push(ws);
      assert.equal(ws.readyState, WebSocket.OPEN, `rejected a connection for "${value}"`);

      ws.terminate();
      openSockets = [];
      closeWebsocketServer();
      await new Promise((resolve) => running.server.close(resolve));
      running = null;
    }
  });
});

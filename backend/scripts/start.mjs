import { spawn } from 'node:child_process';
import os from 'node:os';

const FORWARDED_SIGNALS = ['SIGTERM', 'SIGINT'];

// This script is PID 1 in the container. Node's default signal handling would kill it
// immediately and orphan the spawned child, so the server would never run its graceful
// shutdown. Forward the signal instead and exit with the child's real status.
const run = (command, args, { env = process.env } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    const forward = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    const listeners = FORWARDED_SIGNALS.map((signal) => {
      const handler = () => forward(signal);
      process.on(signal, handler);
      return [signal, handler];
    });
    const cleanup = () => {
      listeners.forEach(([signal, handler]) => process.off(signal, handler));
    };

    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('exit', (code, signal) => {
      cleanup();
      if (signal) {
        // The child honoured the signal we forwarded; mirror the conventional 128+n status
        // so the orchestrator sees a normal signal-terminated exit rather than a crash.
        process.exit(128 + (os.constants.signals[signal] ?? 15));
      }
      if (code === 0) return resolve();
      return reject(new Error(`Process exited with code ${code}`));
    });
  });

const main = async () => {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }

  // Nothing to migrate and nothing to seed — the engine holds no state. This wrapper
  // exists purely for signal forwarding (see above), which is still needed: it is PID 1.
  await run('node', ['server.js']);
};

main().catch((error) => {
  console.error('[startup] Failed to start server:', error?.message || error);
  process.exit(1);
});

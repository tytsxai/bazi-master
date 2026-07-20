import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

/** 跑一个子进程，把它的 stdio 交给调用方决定。返回退出码，不抛异常。 */
export const run = (command, args, { cwd, env = process.env, stdio = 'inherit' } = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (chunk) => (stdout += chunk));
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        // json 模式下子进程输出被 pipe 走了，仍然要让人看得见，转发到本进程 stderr
        if (stdio !== 'inherit' && process.env.BAZI_CLI_STREAM_CHILD === '1') {
          process.stderr.write(chunk);
        }
      });
    }
    child.on('error', (error) =>
      resolve({ code: 127, signal: null, stdout, stderr: error.message })
    );
    child.on('close', (code, signal) =>
      resolve({ code: code ?? (signal ? 1 : 0), signal, stdout, stderr })
    );
  });

/** 同步捕获输出，用于快速探测（版本号、二进制是否存在）。 */
export const capture = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.error) {
    return { code: 127, stdout: '', stderr: result.error.message, missing: true };
  }
  return {
    code: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    missing: false,
  };
};

export const which = (command) => {
  const result = capture('command', ['-v', command], { shell: '/bin/sh' });
  if (result.code !== 0 || !result.stdout) return null;
  return result.stdout.split('\n')[0].trim();
};

export const checkPort = (port, host = '127.0.0.1', timeoutMs = 500) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.connect(port, host, () => finish(true));
  });

export const waitForPort = async (port, host = '127.0.0.1', timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkPort(port, host)) return true;
    await sleep(250);
  }
  return false;
};

export const waitForPortClosed = async (port, host = '127.0.0.1', timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await checkPort(port, host))) return true;
    await sleep(200);
  }
  return false;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 进程是否还活着（用于 pidfile 校验）。 */
export const isAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

export const killPid = (pid, signal = 'SIGTERM') => {
  if (!isAlive(pid)) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
};

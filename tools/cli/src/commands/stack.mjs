import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, usageError } from '../core/errors.mjs';
import { checkPort, isAlive, killPid, run, waitForPortClosed } from '../core/proc.mjs';
import { buildEnv, ensureStateDirs, fileExists, paths } from '../core/context.mjs';
import { clearRecord, logFile, readRecord, tailLog, writeRecord } from '../core/stackState.mjs';

/**
 * 引擎是无状态纯计算，本地栈就只剩一个进程。
 *
 * 这里以前还托管一个 PostgreSQL 组件（以及 --only 用来单独起它）。存储层删掉之后，
 * 「按组件挑」这件事已经无从挑起，所以 --only 一并去掉了，而不是留一个只能填 api 的开关。
 */
const COMPONENT = 'api';

const apiPort = (env) => Number(env.PORT || 4000);

// ------------------------------------------------------------------ 探测

const probeHealth = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    const body = await response.json().catch(() => null);
    return { reachable: true, status: response.status, healthy: response.ok, body };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      healthy: false,
      error: error?.message || String(error),
    };
  }
};

// ------------------------------------------------------------------ 进程托管

/**
 * 把一堆 pino JSON 日志压成一条能用的诊断。
 *
 * 原样把几十 KB 日志塞进 hint 等于没给信息 —— Agent 拿到的是噪音，人也读不下去。
 * 已知失败特征直接翻译成下一步命令；认不出来的才回退到截断的日志尾巴。
 */
const SIGNATURES = [
  { match: /EADDRINUSE/i, reason: '端口已被占用', next: 'bazi stack status' },
  {
    match: /DOCS_PASSWORD/,
    reason: '生产模式下 DOCS_PASSWORD 必填，缺了它进程会直接退出',
    next: 'bazi env check --json',
  },
  {
    match: /Cannot find module|ERR_MODULE_NOT_FOUND/i,
    reason: '后端依赖缺失或不完整',
    next: 'bazi setup',
  },
];

const diagnose = (name, fallbackNext) => {
  const raw = tailLog(name, 200);
  for (const signature of SIGNATURES) {
    if (signature.match.test(raw)) {
      return { hint: signature.reason, next: signature.next };
    }
  }
  // 认不出来：只给最后几行，并且截断，避免把整屏日志灌进 JSON。
  const tail = raw.split('\n').filter(Boolean).slice(-6).join('\n').slice(-1500);
  return { hint: tail || '日志为空', next: fallbackNext };
};

const spawnDetached = ({ name, command, args, cwd, env }) => {
  ensureStateDirs();
  const fd = fs.openSync(logFile(name), 'a');
  fs.writeSync(
    fd,
    `\n[bazi-cli ${new Date().toISOString()}] start: ${command} ${args.join(' ')}\n`
  );
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  fs.closeSync(fd);
  writeRecord(name, {
    pid: child.pid,
    command: `${command} ${args.join(' ')}`,
    cwd,
    startedAt: new Date().toISOString(),
    log: logFile(name),
  });
  return child.pid;
};

/**
 * 只停我们自己启动的进程。
 *
 * 端口被占但没有我们的 pidfile ——说明是别人（另一个终端、dev-server、同事）起的，
 * 这时候必须报告 foreign 并拒绝动手，而不是照着端口去 kill。
 */
const stopManaged = async (name, port) => {
  const record = readRecord(name);
  if (!record) {
    const occupied = await checkPort(port);
    return { status: occupied ? 'foreign' : 'not-running' };
  }
  if (!record.alive) {
    clearRecord(name);
    return { status: 'not-running', note: 'pidfile 是陈旧的，已清理' };
  }
  killPid(record.pid, 'SIGTERM');
  const closed = await waitForPortClosed(port, '127.0.0.1', 8000);
  if (!closed && isAlive(record.pid)) {
    killPid(record.pid, 'SIGKILL');
    await waitForPortClosed(port, '127.0.0.1', 3000);
  }
  clearRecord(name);
  return { status: 'stopped', pid: record.pid };
};

// ------------------------------------------------------------------ api

const startApi = async ({ env, out, dryRun }) => {
  const port = apiPort(env);
  const record = readRecord('api');

  if (record?.alive) {
    const health = await probeHealth(port);
    if (health.healthy) {
      return { component: 'api', status: 'already-running', pid: record.pid, port };
    }
    throw new CliError(`api 进程还活着（pid ${record.pid}）但 /health 不通`, {
      exit: EXIT.ENV,
      code: 'api_unhealthy',
      ...diagnose('api', 'bazi stack restart'),
      details: { health },
    });
  }

  if (await checkPort(port, '127.0.0.1', 600)) {
    const health = await probeHealth(port);
    return {
      component: 'api',
      status: 'foreign',
      port,
      detail: health.healthy
        ? `端口 ${port} 上已经有一个健康的后端（不是 bazi 启动的），直接复用`
        : `端口 ${port} 被别的进程占用，且 /health 不通`,
    };
  }

  if (!fileExists(path.join(paths.backend, 'node_modules'))) {
    throw new CliError('后端依赖未安装，api 起不来', {
      exit: EXIT.ENV,
      code: 'deps_missing',
      next: 'bazi setup',
    });
  }

  if (dryRun) return { component: 'api', status: 'dry-run', port };

  out.step(`启动后端（端口 ${port}）`);
  const pid = spawnDetached({
    name: 'api',
    command: process.execPath,
    args: ['server.js'],
    cwd: paths.backend,
    env: { ...env, PORT: String(port) },
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) break;
    const health = await probeHealth(port);
    if (health.healthy) {
      return { component: 'api', status: 'started', pid, port, health: health.body };
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  killPid(pid, 'SIGKILL');
  clearRecord('api');
  throw new CliError('后端启动失败或健康检查超时', {
    exit: EXIT.ENV,
    code: 'api_start_failed',
    ...diagnose('api', 'bazi stack logs --tail 60'),
  });
};

// ------------------------------------------------------------------ status

const collectStatus = async (env) => {
  const port = apiPort(env);
  const record = readRecord('api');
  const health = await probeHealth(port);
  const component = {
    name: 'api',
    running: health.healthy,
    port,
    pid: record?.alive ? record.pid : null,
    managedBy: record?.alive ? 'bazi' : health.reachable ? 'foreign' : null,
    health: health.body || null,
    detail: health.healthy
      ? `/health ${health.status}`
      : health.reachable
        ? `端口通但 /health 返回 ${health.status}`
        : '不可连通',
    next: health.healthy ? null : 'bazi stack up',
  };

  return { ready: component.running, components: [component] };
};

/** 给别的命令做前置断言用。 */
export const collectStackStatus = collectStatus;

const renderStatus = (out) => (data) => {
  const lines = data.components.map((c) => {
    const icon = out.statusIcon(c.running ? 'ok' : 'fail');
    const owner = c.managedBy ? ` [${c.managedBy}]` : '';
    return `${icon} ${c.name.padEnd(5)} ${String(c.port ?? '-').padEnd(6)}${c.detail}${owner}`;
  });
  const blocked = data.components.filter((c) => !c.running && c.next);
  if (blocked.length) {
    lines.push('', '下一步:');
    for (const c of blocked) lines.push(`  ${c.next}`);
  }
  lines.push('', data.ready ? '整体: 就绪' : '整体: 未就绪');
  return lines.join('\n');
};

// ------------------------------------------------------------------ 命令

export const stackCommand = defineCommand({
  name: 'stack',
  summary: '管理本地引擎进程的生命周期',
  description:
    '引擎无状态，本地栈就是一个后端进程，起停查都在这里。\n' +
    'CLI 只会停自己启动的进程；端口被别人占用时会报 foreign 并拒绝接管。',
  commands: [
    defineCommand({
      name: 'up',
      summary: '启动引擎（幂等，已在跑的会跳过）',
      examples: [{ note: '起引擎', command: 'bazi stack up --json' }],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const started = await startApi({ env, out, dryRun: flags['dry-run'] });
        const status = flags['dry-run'] ? null : await collectStatus(env);
        return out.ok({ started: [started], status }, (d) => {
          const lines = d.started.map(
            (r) =>
              `${out.statusIcon(r.status === 'foreign' ? 'warn' : 'ok')} ${r.component.padEnd(5)} ${r.status}${r.detail ? ` — ${r.detail}` : ''}`
          );
          if (d.status) lines.push('', renderStatus(out)(d.status));
          return lines.join('\n');
        });
      },
    }),

    defineCommand({
      name: 'down',
      summary: '停止引擎（只停 bazi 自己启动的进程）',
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const port = apiPort(env);
        if (flags['dry-run']) {
          return out.ok(
            { stopped: [{ component: COMPONENT, status: 'dry-run', port }] },
            () => `[dry-run] 会停掉端口 ${port} 上由 bazi 启动的进程`
          );
        }
        out.step('停止引擎');
        const stopped = [{ component: COMPONENT, port, ...(await stopManaged(COMPONENT, port)) }];
        return out.ok({ stopped }, (d) =>
          d.stopped
            .map(
              (r) =>
                `${r.status === 'foreign' ? '!' : '-'} ${r.component.padEnd(5)} ${r.status}${r.detail ? ` — ${r.detail}` : ''}`
            )
            .join('\n')
        );
      },
    }),

    defineCommand({
      name: 'status',
      summary: '查看引擎在跑没跑、由谁托管、健康不健康',
      description: '默认永远退出 0（这是查询命令）。要让它在未就绪时失败，加 --require-ready。',
      flags: [
        {
          name: 'require-ready',
          type: 'boolean',
          summary: '未就绪时退出码 3，适合放在脚本/Agent 的前置检查里',
        },
      ],
      examples: [
        { note: '看一眼', command: 'bazi stack status' },
        { note: '当作前置断言', command: 'bazi stack status --require-ready --json' },
      ],
      run: async ({ flags, out }) => {
        const data = await collectStatus(buildEnv());
        if (flags['require-ready'] && !data.ready) {
          out.render(data, renderStatus(out));
          const first = data.components.find((c) => !c.running);
          throw new CliError('本地引擎未就绪', {
            exit: EXIT.ENV,
            code: 'env_not_ready',
            hint: `${first.name}: ${first.detail}`,
            next: first.next || 'bazi stack up',
            details: data,
          });
        }
        return out.ok(data, renderStatus(out));
      },
    }),

    defineCommand({
      name: 'logs',
      summary: '看引擎日志',
      usage: 'bazi stack logs [--tail N] [--follow]',
      flags: [
        { name: 'tail', type: 'number', summary: '取最后 N 行', default: 60 },
        { name: 'follow', alias: 'f', type: 'boolean', summary: '持续跟随（不能与 --json 同用）' },
      ],
      run: async ({ positionals, flags, out }) => {
        if (positionals.length) {
          throw usageError(`stack logs 不再接受组件参数（收到 "${positionals[0]}"）`, {
            hint: '本地栈只剩引擎进程一个组件，数据库组件已随存储层一起删除。',
            next: 'bazi stack logs --tail 60',
          });
        }
        const file = logFile(COMPONENT);
        if (!fileExists(file)) {
          return out.ok(
            { component: COMPONENT, file, lines: [], note: '还没有日志' },
            () => `（${file} 不存在，说明引擎还没被 bazi 启动过）`
          );
        }
        if (flags.follow) {
          if (flags.json) {
            throw usageError('--follow 与 --json 不能同用（流式输出没法是一个 JSON 文档）');
          }
          await run('tail', ['-n', String(flags.tail), '-f', file], { stdio: 'inherit' });
          return EXIT.OK;
        }
        const lines = fs.readFileSync(file, 'utf8').split('\n').slice(-flags.tail);
        return out.ok({ component: COMPONENT, file, lines }, (d) => d.lines.join('\n'));
      },
    }),

    defineCommand({
      name: 'restart',
      summary: '先 down 再 up',
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const port = apiPort(env);
        const stopped = flags['dry-run']
          ? { component: COMPONENT, status: 'dry-run' }
          : { component: COMPONENT, ...(await stopManaged(COMPONENT, port)) };
        const started = await startApi({ env, out, dryRun: flags['dry-run'] });
        const status = flags['dry-run'] ? null : await collectStatus(env);
        return out.ok({ stopped: [stopped], started: [started], status }, (d) =>
          [
            ...d.started.map((r) => `${out.statusIcon('ok')} ${r.component.padEnd(5)} ${r.status}`),
            '',
            d.status ? renderStatus(out)(d.status) : '',
          ].join('\n')
        );
      },
    }),
  ],
});

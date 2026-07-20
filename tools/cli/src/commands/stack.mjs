import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, envError, usageError } from '../core/errors.mjs';
import {
  checkPort,
  isAlive,
  killPid,
  run,
  waitForPort,
  waitForPortClosed,
  which,
} from '../core/proc.mjs';
import {
  buildEnv,
  describeDatabaseUrl,
  ensureStateDirs,
  fileExists,
  paths,
  resolveDatabaseUrl,
} from '../core/context.mjs';
import { clearRecord, logFile, readRecord, tailLog, writeRecord } from '../core/stackState.mjs';
import { migrationState } from '../core/prisma.mjs';

const COMPONENTS = ['db', 'api', 'web'];
const here = path.dirname(fileURLToPath(import.meta.url));
const localPgHelper = path.resolve(here, '..', 'helpers', 'local-pg.mjs');

const apiPort = (env) => Number(env.PORT || 4000);
const webPort = (env) => Number(env.BAZI_WEB_PORT || 3000);

const resolveTargets = (only) => {
  if (!only) return COMPONENTS;
  const wanted = String(only)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = wanted.filter((w) => !COMPONENTS.includes(w));
  if (bad.length) {
    throw usageError(`未知组件：${bad.join(', ')}`, {
      next: `--only 只接受 ${COMPONENTS.join(' / ')}，可以逗号分隔`,
    });
  }
  return COMPONENTS.filter((c) => wanted.includes(c));
};

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

/** DATABASE_URL 指向哪、由谁负责它的生命周期。 */
const describeDbTarget = (env) => {
  const url = resolveDatabaseUrl(env);
  if (!url) {
    throw envError('DATABASE_URL 未配置，无法确定要启动哪个数据库', { next: 'bazi env init' });
  }
  const info = describeDatabaseUrl(url);
  if (!info.kind.startsWith('postgres')) {
    throw envError(`DATABASE_URL 不是 PostgreSQL（kind=${info.kind}）`, {
      hint: 'prisma/schema.prisma 的 provider 是 postgresql，两边必须一致。',
      next: 'bazi doctor --only db',
    });
  }
  return {
    ...info,
    port: Number(info.port || 5432),
    host: info.host || '127.0.0.1',
    /** 非本地库一律不由 CLI 托管生命周期 —— 不启动，也绝不停止。 */
    managed: info.local,
  };
};

// ------------------------------------------------------------------ 通用进程托管

/**
 * 把一堆 pino JSON 日志压成一条能用的诊断。
 *
 * 原样把几十 KB 日志塞进 hint 等于没给信息 —— Agent 拿到的是噪音，人也读不下去。
 * 已知失败特征直接翻译成下一步命令；认不出来的才回退到截断的日志尾巴。
 */
const SIGNATURES = [
  {
    match: /does not exist in the current database|P2021|P1014/i,
    reason: '数据库缺少表结构（迁移未应用）',
    next: 'bazi db migrate',
  },
  {
    match: /P1001|Can't reach database server/i,
    reason: '连不上数据库',
    next: 'bazi stack up --only db',
  },
  { match: /EADDRINUSE/i, reason: '端口已被占用', next: 'bazi stack status' },
  {
    match: /SESSION_TOKEN_SECRET|ADMIN_EMAILS/,
    reason: '必填环境变量缺失或不合法',
    next: 'bazi env check --json',
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

// ------------------------------------------------------------------ db

const startDb = async ({ env, out, dryRun }) => {
  const target = describeDbTarget(env);

  if (!target.managed) {
    return {
      component: 'db',
      status: 'skipped',
      strategy: 'remote',
      detail: `${target.redacted} 是远端库，CLI 不托管它的生命周期`,
    };
  }

  if (await checkPort(target.port, target.host, 1000)) {
    return {
      component: 'db',
      status: 'already-running',
      strategy: readRecord('db')?.strategy || 'external',
      detail: `${target.host}:${target.port} 已经可连通`,
    };
  }

  const composeFile = path.join(paths.root, 'docker-compose.yml');
  const useCompose = Boolean(which('docker')) && target.port === 5432 && fileExists(composeFile);
  const strategy = useCompose ? 'docker-compose' : 'pg_ctl';

  if (dryRun) {
    return { component: 'db', status: 'dry-run', strategy, detail: `会用 ${strategy} 启动` };
  }

  if (useCompose) {
    out.step('用 docker compose 启动 postgres');
    const result = await run('docker', ['compose', 'up', '-d', 'postgres'], {
      cwd: paths.root,
      env,
      stdio: out.childStdio,
    });
    if (result.code !== 0) {
      throw new CliError('docker compose 启动 postgres 失败', {
        exit: EXIT.ENV,
        code: 'db_start_failed',
        hint: (result.stderr || '').trim().slice(-600),
        next: '确认 Docker 正在运行；或者把 DATABASE_URL 换成 127.0.0.1:5433 走本地 pg_ctl',
      });
    }
  } else {
    if (!which('pg_ctl') || !which('initdb')) {
      throw envError('既没有可用的 Docker，也没有本地 PostgreSQL 工具链', {
        hint: `需要在 ${target.host}:${target.port} 起一个 PostgreSQL，但 pg_ctl/initdb 都找不到。`,
        next: 'brew install postgresql@16   # 或者装好 Docker 后把 DATABASE_URL 换成 5432 端口',
      });
    }
    out.step(`用 pg_ctl 启动本地 PostgreSQL（${paths.pgData}）`);
    // pg_ctl -l 不会替你建目录，日志目录必须先存在，否则它直接退 1 且不留任何日志。
    ensureStateDirs();
    const resultFile = path.join(paths.state, 'local-pg-start.json');
    const result = await run(process.execPath, [localPgHelper, 'start', resultFile], {
      cwd: paths.root,
      env: {
        ...env,
        BAZI_HELPER_PG_DATADIR: paths.pgData,
        BAZI_HELPER_PG_HOST: target.host,
        BAZI_HELPER_PG_PORT: String(target.port),
        BAZI_HELPER_PG_DB: target.database || 'bazi_master',
        BAZI_HELPER_PG_LOG: path.join(paths.logs, 'postgres.log'),
        // locale 兜底（macOS 上 postmaster 会因为空 LANG/LC_ALL 起不来）在
        // backend/scripts/local-postgres.mjs 里，所有 initdb/pg_ctl 调用方共用一份。
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let payload = null;
    try {
      payload = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    } catch {
      /* helper 没来得及写结果，下面按退出码报错 */
    }
    if (result.code !== 0 || !payload?.ok) {
      throw new CliError('本地 PostgreSQL 启动失败', {
        exit: EXIT.ENV,
        code: 'db_start_failed',
        hint: payload?.error || (result.stderr || '').trim().slice(-600) || `退出码 ${result.code}`,
        next: `看日志：${path.join(paths.logs, 'postgres.log')}`,
      });
    }
  }

  const up = await waitForPort(target.port, target.host, 45_000);
  if (!up) {
    throw new CliError(`PostgreSQL 起来了但 ${target.host}:${target.port} 仍不可连通`, {
      exit: EXIT.ENV,
      code: 'db_unreachable',
      next: 'bazi stack logs db',
    });
  }

  writeRecord('db', { strategy, port: target.port, host: target.host, dataDir: paths.pgData });
  return {
    component: 'db',
    status: 'started',
    strategy,
    detail: `${target.host}:${target.port}（${target.database}）`,
  };
};

const stopDb = async ({ env, out, dryRun }) => {
  const target = describeDbTarget(env);
  if (!target.managed) {
    return { component: 'db', status: 'skipped', detail: '远端库，不停' };
  }
  const record = readRecord('db');
  const strategy = record?.strategy;

  if (!strategy) {
    const occupied = await checkPort(target.port, target.host, 800);
    return {
      component: 'db',
      status: occupied ? 'foreign' : 'not-running',
      detail: occupied
        ? `${target.host}:${target.port} 有东西在跑，但不是 bazi 启动的，不动它`
        : '未运行',
    };
  }
  if (dryRun) return { component: 'db', status: 'dry-run', strategy };

  if (strategy === 'docker-compose') {
    out.step('停止 docker compose postgres');
    await run('docker', ['compose', 'stop', 'postgres'], {
      cwd: paths.root,
      env,
      stdio: out.childStdio,
    });
  } else {
    out.step('停止本地 PostgreSQL');
    const resultFile = path.join(paths.state, 'local-pg-stop.json');
    await run(process.execPath, [localPgHelper, 'stop', resultFile], {
      cwd: paths.root,
      env: { ...env, BAZI_HELPER_PG_DATADIR: paths.pgData },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  clearRecord('db');
  return { component: 'db', status: 'stopped', strategy };
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
      ...diagnose('api', 'bazi stack restart --only api'),
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

  // 依赖前置：db 不通就直接给下一步命令，而不是让 server.js 启动后自己崩。
  const target = describeDbTarget(env);
  if (!(await checkPort(target.port, target.host, 1200))) {
    throw envError(`数据库 ${target.host}:${target.port} 不可连通，api 起不来`, {
      next: 'bazi stack up --only db',
    });
  }
  if (!fileExists(path.join(paths.backend, 'node_modules', '.prisma', 'client'))) {
    throw envError('Prisma Client 未生成', { next: 'bazi setup --skip-install' });
  }

  // 迁移没跑时 server.js 起得来、端口也通，但 /health 一直 503。
  // 不做这个前置检查，表现就是 45 秒超时 + 一屏 Prisma 报错，Agent 极易误判成"后端坏了"。
  // 多花一两秒把它变成一条明确的下一步命令，是值得的。
  const migrations = await migrationState(env);
  if (migrations.state === 'pending' || migrations.state === 'no-schema') {
    throw envError('数据库缺少表结构（迁移未应用），api 起来也会一直 503', {
      hint: migrations.text.slice(-400),
      next: 'bazi db migrate',
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
    ...diagnose('api', 'bazi stack logs api --tail 60'),
  });
};

// ------------------------------------------------------------------ web

const ensureWasm = async ({ env, out, dryRun }) => {
  const wasm = path.join(paths.frontend, 'public', 'wasm', 'optimized.wasm');
  if (fileExists(wasm)) return false;
  if (dryRun) {
    out.step('[dry-run] 会先构建 AssemblyScript wasm');
    return false;
  }
  out.step('public/wasm/optimized.wasm 缺失，先构建 wasm');
  const build = await run('npm', ['run', 'asbuild'], {
    cwd: paths.frontend,
    env,
    stdio: out.childStdio,
  });
  if (build.code !== 0) {
    throw new CliError('wasm 构建失败', {
      exit: EXIT.ENV,
      code: 'wasm_build_failed',
      hint: (build.stderr || '').trim().slice(-600),
      next: 'npm --prefix frontend install',
    });
  }
  await run(process.execPath, ['scripts/sync-wasm.mjs'], {
    cwd: paths.frontend,
    env,
    stdio: out.childStdio,
  });
  return true;
};

const startWeb = async ({ env, out, dryRun }) => {
  const port = webPort(env);
  const record = readRecord('web');

  if (record?.alive && (await checkPort(port, '127.0.0.1', 600))) {
    return { component: 'web', status: 'already-running', pid: record.pid, port };
  }
  if (await checkPort(port, '127.0.0.1', 600)) {
    return {
      component: 'web',
      status: 'foreign',
      port,
      detail: `端口 ${port} 已被占用，但不是 bazi 启动的，不接管`,
    };
  }

  const viteBin = path.join(
    paths.frontend,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  );
  if (!fileExists(viteBin)) {
    throw envError('前端依赖未安装（找不到 vite）', {
      next: 'bazi setup --with-frontend',
    });
  }

  if (dryRun) return { component: 'web', status: 'dry-run', port };

  await ensureWasm({ env, out, dryRun });

  out.step(`启动前端（端口 ${port}，代理到后端 ${apiPort(env)}）`);
  const pid = spawnDetached({
    name: 'web',
    command: viteBin,
    args: ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    cwd: paths.frontend,
    // vite.config.ts 用 BACKEND_PORT 决定 /api 代理到哪
    env: { ...env, BACKEND_PORT: String(apiPort(env)) },
  });

  const up = await waitForPort(port, '127.0.0.1', 60_000);
  if (!up) {
    killPid(pid, 'SIGKILL');
    clearRecord('web');
    throw new CliError('前端启动失败或端口未就绪', {
      exit: EXIT.ENV,
      code: 'web_start_failed',
      ...diagnose('web', 'bazi stack logs web --tail 60'),
    });
  }
  return { component: 'web', status: 'started', pid, port };
};

// ------------------------------------------------------------------ status

const collectStatus = async (env) => {
  const components = [];

  let dbTarget = null;
  try {
    dbTarget = describeDbTarget(env);
  } catch (error) {
    components.push({
      name: 'db',
      running: false,
      detail: error.message,
      next: error.next || 'bazi env init',
    });
  }
  if (dbTarget) {
    const record = readRecord('db');
    const open = await checkPort(dbTarget.port, dbTarget.host, 1200);
    components.push({
      name: 'db',
      running: open,
      port: dbTarget.port,
      host: dbTarget.host,
      database: dbTarget.database,
      managedBy: record?.strategy || (open ? 'external' : null),
      detail: open ? `${dbTarget.redacted} 可连通` : `${dbTarget.host}:${dbTarget.port} 不可连通`,
      next: open ? null : 'bazi stack up --only db',
    });
  }

  const aPort = apiPort(env);
  const apiRecord = readRecord('api');
  const health = await probeHealth(aPort);
  components.push({
    name: 'api',
    running: health.healthy,
    port: aPort,
    pid: apiRecord?.alive ? apiRecord.pid : null,
    managedBy: apiRecord?.alive ? 'bazi' : health.reachable ? 'foreign' : null,
    health: health.body || null,
    detail: health.healthy
      ? `/health ${health.status}`
      : health.reachable
        ? `端口通但 /health 返回 ${health.status}`
        : '不可连通',
    next: health.healthy ? null : 'bazi stack up --only api',
  });

  const wPort = webPort(env);
  const webRecord = readRecord('web');
  const webOpen = await checkPort(wPort, '127.0.0.1', 800);
  components.push({
    name: 'web',
    running: webOpen,
    port: wPort,
    pid: webRecord?.alive ? webRecord.pid : null,
    managedBy: webRecord?.alive ? 'bazi' : webOpen ? 'foreign' : null,
    url: webOpen ? `http://127.0.0.1:${wPort}/` : null,
    detail: webOpen ? '端口已监听' : '未运行',
    next: webOpen ? null : 'bazi stack up --only web',
  });

  return { ready: components.every((c) => c.running), components };
};

/** 给别的命令做前置断言用（verify 靠它判断栈是否就绪）。 */
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

const STARTERS = { db: startDb, api: startApi, web: startWeb };

export const stackCommand = defineCommand({
  name: 'stack',
  summary: '管理本地开发栈（db / api / web）的生命周期',
  description:
    '三个组件各自独立托管，可以单独起停查，像 kubectl 那样先看状态再动手。\n' +
    'CLI 只会停自己启动的进程；端口被别人占用时会报 foreign 并拒绝接管。',
  commands: [
    defineCommand({
      name: 'up',
      summary: '按 db -> api -> web 顺序启动（幂等，已在跑的会跳过）',
      flags: [
        { name: 'only', type: 'string', summary: '只启动指定组件，逗号分隔：db,api,web' },
        { name: 'wait', type: 'boolean', summary: '启动后再跑一次 status 确认', default: true },
      ],
      examples: [
        { note: '起完整栈', command: 'bazi stack up --json' },
        { note: '只要后端（跑接口测试够用）', command: 'bazi stack up --only db,api' },
      ],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const targets = resolveTargets(flags.only);
        const results = [];
        for (const name of targets) {
          results.push(await STARTERS[name]({ env, out, dryRun: flags['dry-run'] }));
        }
        const status = flags['dry-run'] ? null : await collectStatus(env);
        return out.ok({ started: results, status }, (d) => {
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
      summary: '按 web -> api -> db 顺序停止（只停 bazi 自己启动的进程）',
      flags: [{ name: 'only', type: 'string', summary: '只停指定组件，逗号分隔' }],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const targets = resolveTargets(flags.only).reverse();
        const results = [];
        for (const name of targets) {
          if (name === 'db') {
            results.push(await stopDb({ env, out, dryRun: flags['dry-run'] }));
            continue;
          }
          const port = name === 'api' ? apiPort(env) : webPort(env);
          if (flags['dry-run']) {
            results.push({ component: name, status: 'dry-run', port });
            continue;
          }
          out.step(`停止 ${name}`);
          results.push({ component: name, port, ...(await stopManaged(name, port)) });
        }
        return out.ok({ stopped: results }, (d) =>
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
      summary: '查看每个组件在跑没跑、由谁托管、健康不健康',
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
          throw envError('本地栈未就绪', {
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
      summary: '看某个组件的日志',
      usage: 'bazi stack logs <db|api|web> [--tail N] [--follow]',
      args: [{ name: 'component', required: true, choices: COMPONENTS }],
      flags: [
        { name: 'tail', type: 'number', summary: '取最后 N 行', default: 60 },
        { name: 'follow', alias: 'f', type: 'boolean', summary: '持续跟随（不能与 --json 同用）' },
      ],
      run: async ({ positionals, flags, out }) => {
        const name = positionals[0];
        if (!COMPONENTS.includes(name)) {
          throw usageError(`组件只能是 ${COMPONENTS.join(' / ')}`, { next: 'bazi stack logs api' });
        }
        const file = name === 'db' ? path.join(paths.logs, 'postgres.log') : logFile(name);
        if (!fileExists(file)) {
          return out.ok(
            { component: name, file, lines: [], note: '还没有日志' },
            () => `（${file} 不存在，说明这个组件还没被 bazi 启动过）`
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
        return out.ok({ component: name, file, lines }, (d) => d.lines.join('\n'));
      },
    }),

    defineCommand({
      name: 'restart',
      summary: '先 down 再 up（同样支持 --only）',
      flags: [{ name: 'only', type: 'string', summary: '只重启指定组件，逗号分隔' }],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const targets = resolveTargets(flags.only);
        const stopped = [];
        for (const name of [...targets].reverse()) {
          if (name === 'db') {
            stopped.push(await stopDb({ env, out, dryRun: flags['dry-run'] }));
            continue;
          }
          const port = name === 'api' ? apiPort(env) : webPort(env);
          if (flags['dry-run']) {
            stopped.push({ component: name, status: 'dry-run' });
            continue;
          }
          stopped.push({ component: name, ...(await stopManaged(name, port)) });
        }
        const started = [];
        for (const name of targets) {
          started.push(await STARTERS[name]({ env, out, dryRun: flags['dry-run'] }));
        }
        const status = flags['dry-run'] ? null : await collectStatus(env);
        return out.ok({ stopped, started, status }, (d) =>
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

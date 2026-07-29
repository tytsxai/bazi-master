import path from 'node:path';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT } from '../core/errors.mjs';
import { checkPort, run, which } from '../core/proc.mjs';
import { buildEnv, describeUrl, fileExists, paths, readEnvFile } from '../core/context.mjs';

const MIN_NODE_MAJOR = 20;

const check = (id, label, status, detail, fix) => ({ id, label, status, detail, fix: fix || null });

const depsInstalled = (dir) => fileExists(path.join(dir, 'node_modules'));

const collectChecks = async () => {
  const env = buildEnv();
  const envFile = readEnvFile();
  const results = [];

  // --- 工具链 ---
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  results.push(
    check(
      'node',
      'Node.js 版本',
      nodeMajor >= MIN_NODE_MAJOR ? 'ok' : 'fail',
      `v${process.versions.node}（要求 >= ${MIN_NODE_MAJOR}）`,
      nodeMajor >= MIN_NODE_MAJOR ? null : `安装 Node ${MIN_NODE_MAJOR}+ 后重试`
    )
  );

  const npmPath = which('npm');
  results.push(
    check(
      'npm',
      'npm 可用',
      npmPath ? 'ok' : 'fail',
      npmPath || '未找到 npm',
      '安装 Node.js 自带的 npm'
    )
  );

  // --- 依赖 ---
  for (const [id, label, dir, fix] of [
    ['deps:root', '根依赖', paths.root, 'npm install'],
    ['deps:backend', '后端依赖', paths.backend, 'npm --prefix backend install'],
  ]) {
    const installed = depsInstalled(dir);
    results.push(
      check(
        id,
        label,
        installed ? 'ok' : 'fail',
        installed ? '已安装' : 'node_modules 缺失',
        installed ? null : fix
      )
    );
  }

  // --- 配置 ---
  results.push(
    check(
      'env:file',
      '.env 存在',
      envFile ? 'ok' : 'fail',
      envFile ? paths.envFile : '缺少 .env（引擎能靠默认值跑起来，但 bazi env 那组命令没法用）',
      envFile ? null : 'bazi env init'
    )
  );

  // 生产模式下 DOCS_PASSWORD 是唯一的硬性必填项：缺了它 server.js 直接退 1。
  // 开发模式下缺它无所谓，所以这里按 NODE_ENV 分档，而不是一律报 fail。
  const isProd = (env.NODE_ENV || '') === 'production';
  const docsPassword = (env.DOCS_PASSWORD || '').trim();
  results.push(
    check(
      'env:docs-password',
      'DOCS_PASSWORD',
      docsPassword ? 'ok' : isProd ? 'fail' : 'skip',
      docsPassword
        ? '已设置'
        : isProd
          ? '生产模式必填，缺了它进程启动即退出'
          : '未设置（开发环境不需要；上线前必须配）',
      docsPassword || !isProd ? null : 'bazi env set DOCS_PASSWORD=<强随机串>'
    )
  );

  // --- Redis（可选，纯缓存） ---
  const redisUrl = (env.REDIS_URL || '').trim();
  if (!redisUrl) {
    results.push(
      check('redis', 'Redis', 'skip', '未配置（可选：只影响跨实例的排盘缓存命中率）', null)
    );
  } else {
    const parsed = describeUrl(redisUrl);
    const open = await checkPort(Number(parsed.port || 6379), parsed.host || '127.0.0.1', 800);
    results.push(
      check(
        'redis',
        'Redis 可连通',
        open ? 'ok' : 'fail',
        `${parsed.host}:${parsed.port || 6379} ${open ? '可连通' : '不可连通'}`,
        open ? null : '启动 Redis，或临时清空 .env 里的 REDIS_URL'
      )
    );
  }

  // --- 端口占用 ---
  const backendPort = Number(env.PORT || 4000);
  const open = await checkPort(backendPort, '127.0.0.1', 400);
  results.push(
    check(
      'port:backend',
      `后端端口 ${backendPort}`,
      'ok',
      open ? '已被占用（服务可能已在运行）' : '空闲',
      null
    )
  );

  const dockerPath = which('docker');
  results.push(
    check(
      'tool:docker',
      'Docker',
      dockerPath ? 'ok' : 'skip',
      dockerPath ? dockerPath : '未安装（本地开发不需要；只有起本地 Redis 或生产 compose 才用到）',
      null
    )
  );

  return results;
};

const AUTO_FIXES = [
  {
    id: 'deps:root',
    label: '安装根依赖',
    exec: (opts) =>
      run('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.root, ...opts }),
  },
  {
    id: 'deps:backend',
    label: '安装后端依赖',
    exec: (opts) =>
      run('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.backend, ...opts }),
  },
  {
    id: 'env:file',
    label: '从 .env.example 生成 .env',
    exec: async () => {
      const { initEnvFile } = await import('./env.mjs');
      initEnvFile();
      return { code: 0 };
    },
  },
];

export const doctorCommand = defineCommand({
  name: 'doctor',
  summary: '体检本地环境，逐项给出可执行的修复命令',
  description:
    '每一项检查都带 fix 字段（一条可以直接复制运行的命令）。\n' +
    '有 fail 时退出码为 3（env），Agent 据此判断"该修环境"而不是"代码有问题"。',
  flags: [
    {
      name: 'fix',
      type: 'boolean',
      summary: '自动执行安全的修复（装依赖、建 .env）',
    },
    { name: 'only', type: 'string', summary: '只跑 id 前缀匹配的检查，如 --only env' },
  ],
  examples: [
    { note: '先看环境是否就绪', command: 'bazi doctor --json' },
    { note: '让它自己把能修的修掉', command: 'bazi doctor --fix' },
  ],
  run: async ({ flags, out }) => {
    let results = await collectChecks();
    if (flags.only) {
      results = results.filter((r) => r.id.startsWith(flags.only));
      if (!results.length) {
        throw new CliError(`没有 id 以 "${flags.only}" 开头的检查项`, {
          exit: EXIT.USAGE,
          next: 'bazi doctor --json',
        });
      }
    }

    const applied = [];
    if (flags.fix) {
      for (const fix of AUTO_FIXES) {
        const failing = results.find((r) => r.id === fix.id && r.status === 'fail');
        if (!failing) continue;
        if (flags['dry-run']) {
          applied.push({ id: fix.id, label: fix.label, status: 'dry-run' });
          out.step(`[dry-run] ${fix.label}`);
          continue;
        }
        out.step(fix.label);
        const result = await fix.exec({ stdio: out.childStdio });
        applied.push({
          id: fix.id,
          label: fix.label,
          status: result.code === 0 ? 'done' : 'failed',
        });
        if (result.code !== 0) out.warn(`${fix.label} 失败：${(result.stderr || '').slice(-400)}`);
      }
      if (applied.length && !flags['dry-run']) {
        out.step('重新体检');
        results = await collectChecks();
        if (flags.only) results = results.filter((r) => r.id.startsWith(flags.only));
      }
    }

    const summary = {
      ok: results.filter((r) => r.status === 'ok').length,
      warn: results.filter((r) => r.status === 'warn').length,
      fail: results.filter((r) => r.status === 'fail').length,
      skip: results.filter((r) => r.status === 'skip').length,
    };

    const data = { summary, checks: results, fixesApplied: applied };

    if (summary.fail > 0) {
      const first = results.find((r) => r.status === 'fail');
      // 文本模式下先把表打出来给人看；json 模式下整份数据挂在 details 里随错误一起返回。
      out.render(data, renderChecks(out));
      throw new CliError(`${summary.fail} 项检查未通过`, {
        exit: EXIT.ENV,
        code: 'env_not_ready',
        hint: `第一个问题：${first.label} — ${first.detail}`,
        next: first.fix || 'bazi doctor --fix',
        details: data,
      });
    }

    return out.ok(data, renderChecks(out));
  },
});

const renderChecks = (out) => (data) => {
  const lines = [];
  for (const item of data.checks) {
    lines.push(`${out.statusIcon(item.status)} ${item.label.padEnd(28)} ${item.detail}`);
    if (item.fix) lines.push(`    ${out.paint('cyan', 'fix:')} ${item.fix}`);
  }
  const { ok, warn, fail, skip } = data.summary;
  lines.push('', `ok=${ok} warn=${warn} fail=${fail} skip=${skip}`);
  return lines.join('\n');
};

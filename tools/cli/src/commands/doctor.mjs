import fs from 'node:fs';
import path from 'node:path';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT } from '../core/errors.mjs';
import { capture, checkPort, run, which } from '../core/proc.mjs';
import {
  buildEnv,
  describeDatabaseUrl,
  fileExists,
  paths,
  readEnvFile,
  readPrismaProvider,
  resolveDatabaseUrl,
} from '../core/context.mjs';

const MIN_NODE_MAJOR = 20;

const check = (id, label, status, detail, fix) => ({ id, label, status, detail, fix: fix || null });

const depsInstalled = (dir) => fileExists(path.join(dir, 'node_modules'));

const PLAYWRIGHT_CLI = path.join(paths.frontend, 'node_modules', 'playwright', 'cli.js');
const PLAYWRIGHT_INSTALL_HINT = 'npm --prefix frontend exec -- playwright install chromium';

const dirHasContent = (target) => {
  try {
    return fs.statSync(target).isDirectory() && fs.readdirSync(target).length > 0;
  } catch {
    return false;
  }
};

/**
 * 问 Playwright 自己"这个版本需要哪些浏览器、装在哪"，再逐个核实目录真的在。
 *
 * 不能只看 ms-playwright 缓存目录下有没有 chromium* 开头的条目：别的项目留下的
 * 旧版本（chromium-1193 之类）会让检查误判成 ok，而本项目实际需要的版本
 * （含 chromium_headless_shell-<rev>，headless 跑 e2e 用的就是它）其实是缺的。
 * 那种"体检全绿、一跑 e2e 全红"比没有检查更浪费时间。
 */
const checkPlaywrightBrowsers = () => {
  if (!depsInstalled(paths.frontend) || !fileExists(PLAYWRIGHT_CLI)) {
    return {
      status: 'skip',
      detail: '前端依赖未安装，无法确认浏览器状态',
      fix: 'bazi setup --with-frontend',
    };
  }

  const probe = capture(process.execPath, [PLAYWRIGHT_CLI, 'install', '--dry-run', 'chromium']);
  if (probe.code !== 0) {
    const reason = (probe.stderr || probe.stdout || '未知错误').split('\n')[0];
    return {
      status: 'warn',
      detail: `无法确认浏览器状态：${reason}`,
      fix: PLAYWRIGHT_INSTALL_HINT,
    };
  }

  const locations = [
    ...new Set(
      [...probe.stdout.matchAll(/^\s*Install location:\s*(.+)$/gm)].map((m) => m[1].trim())
    ),
  ];
  if (!locations.length) {
    return {
      status: 'warn',
      detail: '解析 playwright install --dry-run 输出失败，无法确认浏览器状态',
      fix: PLAYWRIGHT_INSTALL_HINT,
    };
  }

  const missing = locations.filter((dir) => !dirHasContent(dir));
  if (missing.length) {
    return {
      status: 'warn',
      detail: `缺少 ${missing.map((d) => path.basename(d)).join('、')}，e2e 无法运行`,
      fix: PLAYWRIGHT_INSTALL_HINT,
    };
  }

  return {
    status: 'ok',
    detail: `${locations.map((d) => path.basename(d)).join('、')} 已就绪`,
    fix: null,
  };
};

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
    ['deps:frontend', '前端依赖', paths.frontend, 'npm --prefix frontend install'],
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

  const prismaClient = path.join(paths.backend, 'node_modules', '.prisma', 'client');
  results.push(
    check(
      'prisma:client',
      'Prisma Client 已生成',
      fileExists(prismaClient) ? 'ok' : 'fail',
      fileExists(prismaClient) ? prismaClient : '未生成，backend 无法连库',
      fileExists(prismaClient) ? null : 'bazi setup --skip-install'
    )
  );

  // --- 配置 ---
  results.push(
    check(
      'env:file',
      '.env 存在',
      envFile ? 'ok' : 'fail',
      envFile ? paths.envFile : '缺少 .env（后端启动会用不安全的默认值）',
      envFile ? null : 'bazi env init'
    )
  );

  if (envFile) {
    const secret = env.SESSION_TOKEN_SECRET || '';
    const isDefault = secret.startsWith('dev_secret_change_in_production');
    const secretStatus = secret.length >= 32 ? (isDefault ? 'warn' : 'ok') : 'fail';
    results.push(
      check(
        'env:session-secret',
        'SESSION_TOKEN_SECRET',
        secretStatus,
        secret.length < 32
          ? `长度 ${secret.length}，要求 >= 32`
          : isDefault
            ? '仍是示例默认值，本地可用，上线前必须换'
            : `长度 ${secret.length}`,
        secretStatus === 'ok' ? null : 'bazi env init --rotate-secret'
      )
    );

    const admins = (env.ADMIN_EMAILS || '').trim();
    results.push(
      check(
        'env:admin-emails',
        'ADMIN_EMAILS',
        admins ? 'ok' : 'fail',
        admins || '未设置，管理端点全部不可用',
        admins ? null : '在 .env 里设置 ADMIN_EMAILS=你的邮箱'
      )
    );
  }

  // --- 数据库 ---
  const schemaProvider = readPrismaProvider();
  const dbUrl = resolveDatabaseUrl(env);
  const dbInfo = describeDatabaseUrl(dbUrl);
  results.push(
    check(
      'db:url',
      'DATABASE_URL',
      dbUrl ? 'ok' : 'fail',
      dbUrl ? `${dbInfo.redacted}（schema provider=${schemaProvider || '未知'}）` : '未配置',
      dbUrl ? null : 'bazi env init'
    )
  );

  if (dbUrl && schemaProvider) {
    const matches =
      (schemaProvider === 'sqlite' && dbInfo.kind === 'sqlite') ||
      (schemaProvider.startsWith('postgres') && dbInfo.kind.startsWith('postgres'));
    results.push(
      check(
        'db:provider-match',
        'DATABASE_URL 与 schema provider 一致',
        matches ? 'ok' : 'fail',
        matches
          ? `${schemaProvider}`
          : `schema=${schemaProvider} 但 URL 是 ${dbInfo.kind}，Prisma 会直接报错`,
        matches ? null : '改 .env 的 DATABASE_URL，或改 prisma/schema.prisma 的 provider'
      )
    );
  }

  if (dbInfo.kind.startsWith('postgres') && dbInfo.host) {
    const port = Number(dbInfo.port || 5432);
    const open = await checkPort(port, dbInfo.host, 800);
    results.push(
      check(
        'db:reachable',
        'PostgreSQL 可连通',
        open ? 'ok' : 'fail',
        `${dbInfo.host}:${port} ${open ? '可连通' : '不可连通'}`,
        open ? null : 'bazi stack up --only db'
      )
    );
  }

  const psqlPath = which('psql');
  results.push(
    check(
      'tool:psql',
      'psql / pg_ctl 可用',
      psqlPath ? 'ok' : 'warn',
      psqlPath ? capture('psql', ['--version']).stdout : '未安装，无法用本地 PostgreSQL 或做备份',
      psqlPath ? null : 'brew install postgresql@16'
    )
  );

  // --- Redis（可选） ---
  const redisUrl = (env.REDIS_URL || '').trim();
  if (!redisUrl) {
    results.push(check('redis', 'Redis', 'skip', '未配置（开发环境可选，生产必须配）', null));
  } else {
    const parsed = describeDatabaseUrl(redisUrl);
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
  const frontendPort = 3000;
  for (const [id, label, port] of [
    ['port:backend', `后端端口 ${backendPort}`, backendPort],
    ['port:frontend', `前端端口 ${frontendPort}`, frontendPort],
  ]) {
    const open = await checkPort(port, '127.0.0.1', 400);
    results.push(check(id, label, 'ok', open ? '已被占用（服务可能已在运行）' : '空闲', null));
  }

  // --- E2E ---
  const pw = checkPlaywrightBrowsers();
  results.push(check('e2e:browsers', 'Playwright 浏览器', pw.status, pw.detail, pw.fix));

  const dockerPath = which('docker');
  results.push(
    check(
      'tool:docker',
      'Docker',
      dockerPath ? 'ok' : 'skip',
      dockerPath ? dockerPath : '未安装（本地走 pg_ctl，不影响开发；生产 compose 才需要）',
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
    id: 'deps:frontend',
    label: '安装前端依赖',
    exec: (opts) =>
      run('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.frontend, ...opts }),
  },
  {
    id: 'env:file',
    label: '从 .env.example 生成 .env',
    exec: async () => {
      const { initEnvFile } = await import('./env.mjs');
      initEnvFile({ rotateSecret: true });
      return { code: 0 };
    },
  },
  {
    id: 'prisma:client',
    label: '生成 Prisma Client',
    exec: (opts) =>
      run('node', ['scripts/prisma.mjs', 'generate', `--schema=${paths.prismaSchema}`], {
        cwd: paths.backend,
        env: buildEnv(),
        ...opts,
      }),
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
      summary: '自动执行安全的修复（装依赖、建 .env、生成 Prisma Client）',
    },
    { name: 'only', type: 'string', summary: '只跑 id 前缀匹配的检查，如 --only db' },
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockedError } from './errors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '..', '..', '..', '..');
export const paths = {
  root: repoRoot,
  backend: path.join(repoRoot, 'backend'),
  frontend: path.join(repoRoot, 'frontend'),
  prismaSchema: path.join(repoRoot, 'prisma', 'schema.prisma'),
  envFile: path.join(repoRoot, '.env'),
  envExample: path.join(repoRoot, '.env.example'),
  /** CLI 自己的运行态目录：pidfile、日志、会话缓存。已被 .gitignore 的 .tmp/ 覆盖。 */
  state: path.join(repoRoot, '.tmp', 'cli'),
  logs: path.join(repoRoot, '.tmp', 'cli', 'logs'),
  pgData: path.join(repoRoot, '.tmp', 'cli', 'pg', 'data'),
  backups: path.join(repoRoot, '.tmp', 'cli', 'backups'),
};

export const ensureStateDirs = () => {
  for (const dir of [paths.state, paths.logs, paths.backups]) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/** 极简 .env 解析：够用即可，不引依赖。支持 KEY=VALUE、# 注释、引号包裹。 */
export const parseEnvFile = (content) => {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
};

export const readEnvFile = (file = paths.envFile) => {
  if (!fs.existsSync(file)) return null;
  return parseEnvFile(fs.readFileSync(file, 'utf8'));
};

/**
 * 合成子进程要用的 env。
 * 优先级：真实 process.env > .env 文件。这样 CI / 临时覆盖始终能压过文件。
 */
export const buildEnv = (overrides = {}) => {
  const fromFile = readEnvFile() || {};
  const merged = { ...fromFile };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) merged[key] = value;
  }
  return { ...merged, ...overrides };
};

export const readPrismaProvider = () => {
  try {
    const raw = fs.readFileSync(paths.prismaSchema, 'utf8');
    const block = raw.match(/datasource\s+db\s*{([\s\S]*?)\n}/m)?.[1] ?? '';
    return (block.match(/\bprovider\s*=\s*"([^"]+)"/)?.[1] ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
};

/** 本地开发默认库：跟 backend/scripts/local-postgres.mjs 保持同一套端口/库名约定。 */
export const LOCAL_PG = {
  host: '127.0.0.1',
  port: Number(process.env.BAZI_PG_PORT || 5433),
  db: process.env.BAZI_PG_DB || 'bazi_master',
};

export const localDatabaseUrl = () => {
  const user = process.env.PGUSER || process.env.USER || 'postgres';
  return `postgresql://${encodeURIComponent(user)}@${LOCAL_PG.host}:${LOCAL_PG.port}/${LOCAL_PG.db}?schema=public`;
};

export const resolveDatabaseUrl = (env = buildEnv()) => env.DATABASE_URL || '';

/**
 * Prisma 连接串里有一批 libpq 不认的私有参数（schema、connection_limit…），
 * 直接把 DATABASE_URL 丢给 pg_dump / pg_restore / psql 会报
 * `invalid URI query parameter`。转换一次再给原生工具用。
 */
const PRISMA_ONLY_PARAMS = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'pgbouncer',
  'socket_timeout',
  'statement_cache_size',
  'sslidentity',
  'sslpassword',
];

export const toLibpqUrl = (url) => {
  try {
    const parsed = new URL(url);
    for (const key of PRISMA_ONLY_PARAMS) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
};

export const describeDatabaseUrl = (url) => {
  if (!url) return { kind: 'none', host: null, database: null, local: false, redacted: null };
  if (url.startsWith('file:')) {
    return { kind: 'sqlite', host: null, database: url.slice(5), local: true, redacted: url };
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const local = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(host);
    const redacted = `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ''}${parsed.host}${parsed.pathname}`;
    return {
      kind: parsed.protocol.replace(':', ''),
      host,
      port: parsed.port || null,
      database: parsed.pathname.replace(/^\//, ''),
      user: parsed.username || null,
      local,
      redacted,
    };
  } catch {
    return { kind: 'unknown', host: null, database: null, local: false, redacted: '<unparseable>' };
  }
};

/**
 * 安全边界，硬编码在能力层。
 *
 * 这条规则刻意不放进 SKILL.md —— 文档是软约束，模型会漏读、会在长上下文里衰减。
 * 任何会写库的命令都必须先过这里。
 */
export const assertDestructiveAllowed = ({ action, env = buildEnv(), yes = false, allowRemote = false }) => {
  const url = resolveDatabaseUrl(env);
  const info = describeDatabaseUrl(url);

  if ((env.NODE_ENV || '') === 'production') {
    throw blockedError(`拒绝在 NODE_ENV=production 下执行 ${action}`, {
      hint: '生产环境的破坏性操作不允许由 CLI 自动执行。',
      next: '如果确实需要，请人工在目标机器上操作并留存记录。',
      details: { action, nodeEnv: 'production', database: info.redacted },
    });
  }

  if (!info.local && !allowRemote) {
    throw blockedError(`拒绝对非本地数据库执行 ${action}`, {
      hint: `DATABASE_URL 指向 ${info.host || '未知主机'}，不是 localhost。`,
      next: `确认这是你要操作的库之后，加 --allow-remote --yes 重跑。`,
      details: { action, database: info.redacted },
    });
  }

  if (!yes) {
    throw blockedError(`${action} 是破坏性操作，需要显式确认`, {
      hint: `目标库：${info.redacted || '(未配置)'}`,
      next: `确认无误后加 --yes 重跑；只想看会做什么就加 --dry-run。`,
      details: { action, database: info.redacted },
    });
  }

  return info;
};

export const fileExists = (target) => {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
};

export const readJsonFile = (target, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return fallback;
  }
};

export const writeJsonFile = (target, value) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockedError } from './errors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '..', '..', '..', '..');
export const paths = {
  root: repoRoot,
  backend: path.join(repoRoot, 'backend'),
  envFile: path.join(repoRoot, '.env'),
  envExample: path.join(repoRoot, '.env.example'),
  /** CLI 自己的运行态目录：pidfile、日志。已被 .gitignore 的 .tmp/ 覆盖。 */
  state: path.join(repoRoot, '.tmp', 'cli'),
  logs: path.join(repoRoot, '.tmp', 'cli', 'logs'),
};

export const ensureStateDirs = () => {
  for (const dir of [paths.state, paths.logs]) {
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

/**
 * 把一个连接串拆成可展示的形态，并把密码打码。
 * 引擎无状态之后这里只剩 REDIS_URL 一个调用方，但脱敏逻辑仍然必须走它 ——
 * `bazi env show` 会把结果直接打到终端上。
 */
export const describeUrl = (url) => {
  if (!url) return { kind: 'none', host: null, port: null, local: false, redacted: null };
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return {
      kind: parsed.protocol.replace(':', ''),
      host,
      port: parsed.port || null,
      local: ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(host),
      redacted: `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ''}${parsed.host}${parsed.pathname}`,
    };
  } catch {
    return { kind: 'unknown', host: null, port: null, local: false, redacted: '<unparseable>' };
  }
};

/**
 * 安全边界，硬编码在能力层。
 *
 * 这条规则刻意不放进 SKILL.md —— 文档是软约束，模型会漏读、会在长上下文里衰减。
 * 任何会覆盖既有文件的命令都必须先过这里。
 *
 * 引擎收敛成无状态计算层之后，这里守的不再是数据库，而是 `.env`：它是仓库里唯一
 * 一份存着真实 API Key 的文件，覆盖掉就没了，而重新拿到那些 key 未必还在本机。
 */
export const assertDestructiveAllowed = ({
  action,
  target,
  env = buildEnv(),
  yes = false,
  dryRun = false,
}) => {
  if ((env.NODE_ENV || '') === 'production') {
    throw blockedError(`拒绝在 NODE_ENV=production 下执行 ${action}`, {
      hint: '生产环境的破坏性操作不允许由 CLI 自动执行。',
      next: '如果确实需要，请人工在目标机器上操作并留存记录。',
      details: { action, nodeEnv: 'production', target },
    });
  }

  // --dry-run 不执行任何东西，所以它可以越过"确认"这道闸 —— 但只越过这一道。
  // 上面那道（production）是"你指错环境了"的信号，dry-run 一样拦。
  //
  // 这么排是给 Agent 留一条安全的自助路径：先 --dry-run 看清楚会发生什么，
  // 把结论摆给人，拿到明确的"是"之后再加 --yes。
  // 如果 dry-run 也退 7，Agent 唯一能做的就是去碰 --yes —— 那才是真正削弱了这道闸。
  if (!yes && !dryRun) {
    throw blockedError(`${action} 是破坏性操作，需要显式确认`, {
      hint: `目标文件：${target || '(未指定)'}`,
      next: `先 \`--dry-run\` 看会做什么；确认无误后由人拍板，再加 --yes 重跑。`,
      details: { action, target, dryRunAvailable: true },
    });
  }

  return { action, target };
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

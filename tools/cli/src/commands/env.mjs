import fs from 'node:fs';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, envError, usageError } from '../core/errors.mjs';
import {
  assertDestructiveAllowed,
  buildEnv,
  describeUrl,
  paths,
  readEnvFile,
} from '../core/context.mjs';

const SECRET_PATTERN = /(SECRET|PASSWORD|PASS|APIKEY|API_KEY|_KEY|TOKEN|DSN)$/i;

const redactValue = (key, value) => {
  if (!value) return value;
  if (!SECRET_PATTERN.test(key)) return value;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
};

/** 在保留注释和顺序的前提下改写若干个键。 */
export const patchEnvContent = (content, updates) => {
  const remaining = new Map(Object.entries(updates));
  const lines = content.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = line.indexOf('=');
    if (eq <= 0) return line;
    const key = line.slice(0, eq).trim();
    if (!remaining.has(key)) return line;
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return lines.join('\n');
};

/**
 * 生成 / 补齐 .env。
 *
 * 引擎无状态之后这里不再需要注入任何生成值（原来要生成 SESSION_TOKEN_SECRET 和本地
 * DATABASE_URL，两者都随存储层与会话层一起没了），所以它现在就是一次模板拷贝：
 * .env 不存在就从 .env.example 拷一份，存在就原样不动，除非显式 --force。
 */
export const initEnvFile = ({ force = false } = {}) => {
  if (!fs.existsSync(paths.envExample)) {
    throw envError('缺少 .env.example，无法生成 .env', { next: '检查仓库是否完整' });
  }

  const exists = fs.existsSync(paths.envFile);
  if (exists && !force) {
    return { created: false, overwritten: false, path: paths.envFile };
  }

  fs.copyFileSync(paths.envExample, paths.envFile);
  return { created: !exists, overwritten: exists, path: paths.envFile };
};

/**
 * `env check` 校验的是"这份配置能不能按当前 NODE_ENV 起得来"。
 *
 * 开发环境下引擎一个变量都不需要（全都有默认值），所以这里刻意是空的 —— 唯一的硬性
 * 必填项 DOCS_PASSWORD 只在生产模式下成立，跟 server.js 的启动校验保持同一套口径。
 */
const REQUIRED_KEYS = [];
const PRODUCTION_REQUIRED_KEYS = [
  { key: 'DOCS_PASSWORD', why: '生产模式下缺它 server.js 启动即退出（/api-docs 没法保护）' },
];

export const envCommand = defineCommand({
  name: 'env',
  summary: '管理 .env（生成、查看、校验、改键）',
  commands: [
    defineCommand({
      name: 'init',
      summary: '从 .env.example 生成 .env',
      description:
        '默认不覆盖已有 .env（已存在就直接返回，不改动）。要整份重建用 --force。\n' +
        '--force 会丢掉 .env 里的全部内容，包括本机的 AI API Key —— 它是仓库里唯一一份\n' +
        '存着真实密钥的文件，所以这条路径受安全边界保护，必须 --yes 才会真的执行。',
      destructive: true,
      flags: [
        { name: 'force', type: 'boolean', summary: '用 .env.example 整份覆盖现有 .env（破坏性）' },
      ],
      examples: [
        { note: '首次生成', command: 'bazi env init' },
        { note: '确认要丢掉现有 .env 再重建', command: 'bazi env init --force --dry-run' },
      ],
      run: ({ flags, out }) => {
        const exists = fs.existsSync(paths.envFile);

        // 只有"覆盖已有文件"才是破坏性的：文件不存在时 --force 和普通 init 等价。
        if (flags.force && exists) {
          assertDestructiveAllowed({
            action: '覆盖 .env',
            target: paths.envFile,
            yes: flags.yes,
            dryRun: flags['dry-run'],
          });
        }

        if (flags['dry-run']) {
          return out.ok(
            { dryRun: true, target: paths.envFile, wouldOverwrite: Boolean(flags.force && exists) },
            (d) =>
              d.wouldOverwrite
                ? `[dry-run] 会用 .env.example 整份覆盖 ${d.target}，现有内容（含 API Key）全部丢失`
                : exists
                  ? `[dry-run] ${d.target} 已存在，不会改动`
                  : `[dry-run] 会创建 ${d.target}`
          );
        }

        const result = initEnvFile({ force: flags.force });
        return out.ok(result, (d) =>
          d.created
            ? `已创建 ${d.path}`
            : d.overwritten
              ? `已用 .env.example 覆盖 ${d.path}`
              : `${d.path} 已存在，未改动`
        );
      },
    }),

    defineCommand({
      name: 'show',
      summary: '查看当前生效的配置（密钥自动脱敏）',
      flags: [{ name: 'raw', type: 'boolean', summary: '不脱敏（谨慎，会打印明文密钥）' }],
      run: ({ flags, out }) => {
        const fromFile = readEnvFile();
        if (!fromFile) {
          throw envError('.env 不存在', { next: 'bazi env init' });
        }
        const effective = buildEnv();
        const entries = Object.keys(fromFile)
          .sort()
          .map((key) => {
            const value = effective[key] ?? '';
            const overridden = process.env[key] !== undefined && process.env[key] !== fromFile[key];
            return {
              key,
              value: flags.raw ? value : redactValue(key, value),
              source: overridden ? 'process.env（覆盖了 .env）' : '.env',
            };
          });
        const redis = describeUrl(effective.REDIS_URL || '');
        return out.ok({ entries, redis }, (d) =>
          d.entries
            .map(
              (e) =>
                `${e.key.padEnd(28)} ${e.value || '(空)'}${e.source === '.env' ? '' : `   <- ${e.source}`}`
            )
            .join('\n')
        );
      },
    }),

    defineCommand({
      name: 'check',
      summary: '校验必填配置，缺失时退出码 3',
      description:
        '必填项随 NODE_ENV 变化：开发环境一个都没有（引擎全部走默认值），\n' +
        '生产环境只有 DOCS_PASSWORD —— 跟 server.js 启动时的校验是同一套口径。',
      run: ({ out }) => {
        const env = buildEnv();
        const nodeEnv = env.NODE_ENV || 'development';
        const required = [
          ...REQUIRED_KEYS,
          ...(nodeEnv === 'production' ? PRODUCTION_REQUIRED_KEYS : []),
        ];
        const problems = [];
        for (const { key, why, minLength } of required) {
          const value = (env[key] || '').trim();
          if (!value) problems.push({ key, problem: 'missing', why });
          else if (minLength && value.length < minLength)
            problems.push({ key, problem: `too_short(${value.length}/${minLength})`, why });
        }
        const data = { ok: problems.length === 0, nodeEnv, checked: required.length, problems };
        if (problems.length) {
          out.render(data, () =>
            problems.map((p) => `✗ ${p.key}: ${p.problem} — ${p.why}`).join('\n')
          );
          throw envError(`${problems.length} 项必填配置有问题`, {
            hint: problems.map((p) => `${p.key}=${p.problem}`).join(', '),
            next: `bazi env set ${problems[0].key}=<值>`,
            details: data,
          });
        }
        return out.ok(data, (d) =>
          d.checked
            ? `NODE_ENV=${d.nodeEnv}：${d.checked} 项必填配置齐全。`
            : `NODE_ENV=${d.nodeEnv}：该模式下没有必填配置，引擎全部走默认值。`
        );
      },
    }),

    defineCommand({
      name: 'set',
      summary: '写入或更新一个键（保留注释与顺序）',
      usage: 'bazi env set KEY=VALUE [KEY=VALUE ...]',
      args: [{ name: 'assignments', required: true, summary: 'KEY=VALUE 形式，可多个' }],
      run: ({ positionals, flags, out }) => {
        if (!positionals.length) {
          throw usageError('至少给一个 KEY=VALUE', {
            next: 'bazi env set OPENAI_API_KEY=sk-...',
          });
        }
        const updates = {};
        for (const item of positionals) {
          const eq = item.indexOf('=');
          if (eq <= 0) throw usageError(`"${item}" 不是 KEY=VALUE 形式`);
          updates[item.slice(0, eq).trim()] = item.slice(eq + 1);
        }
        if (!fs.existsSync(paths.envFile)) {
          throw envError('.env 不存在', { next: 'bazi env init' });
        }
        if (flags['dry-run']) {
          return out.ok(
            { dryRun: true, updates: Object.keys(updates) },
            (d) => `[dry-run] 会写入：${d.updates.join(', ')}`
          );
        }
        const content = fs.readFileSync(paths.envFile, 'utf8');
        fs.writeFileSync(paths.envFile, patchEnvContent(content, updates));
        return out.ok({ updated: Object.keys(updates) }, (d) => `已更新：${d.updated.join(', ')}`);
      },
    }),
  ],
  run: () => {
    throw new CliError('env 需要一个子命令', {
      exit: EXIT.USAGE,
      next: 'bazi env --help',
    });
  },
});

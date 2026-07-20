import crypto from 'node:crypto';
import fs from 'node:fs';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, envError, usageError } from '../core/errors.mjs';
import { which } from '../core/proc.mjs';
import {
  buildEnv,
  describeDatabaseUrl,
  localDatabaseUrl,
  parseEnvFile,
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

const generateSecret = () => crypto.randomBytes(32).toString('hex');

/** 本地默认库：有 docker 就跟 compose 的 5432 对齐，没有就用 CLI 自管的 5433。 */
const defaultLocalDatabaseUrl = () =>
  which('docker')
    ? 'postgresql://postgres:postgres@127.0.0.1:5432/bazi_master?schema=public'
    : localDatabaseUrl();

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

export const initEnvFile = ({ force = false, rotateSecret = false } = {}) => {
  if (!fs.existsSync(paths.envExample)) {
    throw envError('缺少 .env.example，无法生成 .env', { next: '检查仓库是否完整' });
  }

  const exists = fs.existsSync(paths.envFile);
  if (exists && !force && !rotateSecret) {
    return { created: false, changed: [], path: paths.envFile };
  }

  const base = exists && !force ? fs.readFileSync(paths.envFile, 'utf8') : fs.readFileSync(paths.envExample, 'utf8');
  const current = parseEnvFile(base);
  const updates = {};

  const secret = current.SESSION_TOKEN_SECRET || '';
  if (rotateSecret || !exists || secret.length < 32 || secret.startsWith('dev_secret_change_in_production')) {
    updates.SESSION_TOKEN_SECRET = generateSecret();
  }
  if (!exists || force || !current.DATABASE_URL) {
    updates.DATABASE_URL = defaultLocalDatabaseUrl();
  }

  const next = patchEnvContent(base, updates);
  fs.writeFileSync(paths.envFile, next.endsWith('\n') ? next : `${next}\n`);
  return { created: !exists, changed: Object.keys(updates), path: paths.envFile };
};

const REQUIRED_KEYS = [
  { key: 'DATABASE_URL', why: '没有它 Prisma 起不来' },
  { key: 'SESSION_TOKEN_SECRET', why: '会话签名密钥，必须 >= 32 字符', minLength: 32 },
  { key: 'ADMIN_EMAILS', why: '管理端点鉴权依赖它' },
];

export const envCommand = defineCommand({
  name: 'env',
  summary: '管理 .env（生成、查看、校验、改键）',
  commands: [
    defineCommand({
      name: 'init',
      summary: '从 .env.example 生成 .env，自动生成安全的 SESSION_TOKEN_SECRET',
      description: '默认不覆盖已有 .env；只补缺失的键。要整份重建用 --force。',
      flags: [
        { name: 'force', type: 'boolean', summary: '用 .env.example 整份覆盖现有 .env' },
        { name: 'rotate-secret', type: 'boolean', summary: '重新生成 SESSION_TOKEN_SECRET' },
      ],
      run: ({ flags, out }) => {
        if (flags['dry-run']) {
          return out.ok({ dryRun: true, target: paths.envFile }, () => `[dry-run] 会写入 ${paths.envFile}`);
        }
        const result = initEnvFile({ force: flags.force, rotateSecret: flags['rotate-secret'] });
        return out.ok(result, (d) =>
          d.created
            ? `已创建 ${d.path}（写入：${d.changed.join(', ') || '无'}）`
            : d.changed.length
              ? `已更新 ${d.path}（${d.changed.join(', ')}）`
              : `${d.path} 已存在且完整，未改动`
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
        const db = describeDatabaseUrl(effective.DATABASE_URL || '');
        return out.ok({ entries, database: db }, (d) =>
          d.entries
            .map((e) => `${e.key.padEnd(28)} ${e.value || '(空)'}${e.source === '.env' ? '' : `   <- ${e.source}`}`)
            .join('\n')
        );
      },
    }),

    defineCommand({
      name: 'check',
      summary: '校验必填配置，缺失时退出码 3',
      run: ({ out }) => {
        const env = buildEnv();
        const problems = [];
        for (const { key, why, minLength } of REQUIRED_KEYS) {
          const value = (env[key] || '').trim();
          if (!value) problems.push({ key, problem: 'missing', why });
          else if (minLength && value.length < minLength)
            problems.push({ key, problem: `too_short(${value.length}/${minLength})`, why });
        }
        const data = { ok: problems.length === 0, problems };
        if (problems.length) {
          out.render(data, () => problems.map((p) => `✗ ${p.key}: ${p.problem} — ${p.why}`).join('\n'));
          throw envError(`${problems.length} 项必填配置有问题`, {
            hint: problems.map((p) => `${p.key}=${p.problem}`).join(', '),
            next: 'bazi env init',
            details: data,
          });
        }
        return out.ok(data, () => '必填配置齐全。');
      },
    }),

    defineCommand({
      name: 'set',
      summary: '写入或更新一个键（保留注释与顺序）',
      usage: 'bazi env set KEY=VALUE [KEY=VALUE ...]',
      args: [{ name: 'assignments', required: true, summary: 'KEY=VALUE 形式，可多个' }],
      run: ({ positionals, flags, out }) => {
        if (!positionals.length) {
          throw usageError('至少给一个 KEY=VALUE', { next: 'bazi env set ADMIN_EMAILS=me@example.com' });
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
          return out.ok({ dryRun: true, updates: Object.keys(updates) }, (d) =>
            `[dry-run] 会写入：${d.updates.join(', ')}`
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

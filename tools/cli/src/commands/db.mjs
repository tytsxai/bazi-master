import fs from 'node:fs';
import path from 'node:path';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, envError, usageError } from '../core/errors.mjs';
import { checkPort, run, which } from '../core/proc.mjs';
import {
  assertDestructiveAllowed,
  buildEnv,
  describeDatabaseUrl,
  ensureStateDirs,
  paths,
  resolveDatabaseUrl,
  toLibpqUrl,
} from '../core/context.mjs';
import { migrationState, runPrisma } from '../core/prisma.mjs';

const prisma = (args, { env, stdio }) => runPrisma(args, { env, stdio });

const requireReachable = async (env) => {
  const url = resolveDatabaseUrl(env);
  if (!url) throw envError('DATABASE_URL 未配置', { next: 'bazi env init' });
  const info = describeDatabaseUrl(url);
  const port = Number(info.port || 5432);
  if (!(await checkPort(port, info.host || '127.0.0.1', 1500))) {
    throw envError(`数据库 ${info.host}:${port} 不可连通`, {
      hint: info.redacted,
      next: info.local ? 'bazi stack up --only db' : '确认远端库可达、网络与凭据正确',
    });
  }
  return info;
};

const requirePgTool = (tool) => {
  const found = which(tool);
  if (!found) {
    throw envError(`找不到 ${tool}`, {
      hint: '备份/恢复依赖 PostgreSQL 客户端工具。',
      next: 'brew install postgresql@16',
    });
  }
  return found;
};

export const dbCommand = defineCommand({
  name: 'db',
  summary: '数据库操作（迁移、重置、备份、恢复、连库）',
  description:
    '破坏性子命令统一走同一道安全闸：NODE_ENV=production 直接拒绝；非本地库必须 --allow-remote；\n' +
    '任何情况下都必须 --yes。这道闸在代码里，不在文档里。',
  commands: [
    defineCommand({
      name: 'status',
      summary: '数据库是否可连通 + 迁移是否已全部应用',
      run: async ({ out }) => {
        const env = buildEnv();
        const info = await requireReachable(env);
        const { state, text } = await migrationState(env);
        const data = {
          database: info.redacted,
          reachable: true,
          migrations: state,
          output: text,
        };
        if (state !== 'up-to-date') {
          out.render(data, (d) => d.output);
          throw new CliError(
            state === 'pending' || state === 'no-schema' ? '有未应用的迁移' : '无法确认迁移状态',
            {
              exit: EXIT.ENV,
              code: 'migrations_pending',
              hint: text.slice(-500),
              next: 'bazi db migrate',
              details: data,
            }
          );
        }
        return out.ok(data, (d) => `${d.database}\n迁移: ${d.migrations}`);
      },
    }),

    defineCommand({
      name: 'migrate',
      summary: '应用待执行的迁移（migrate deploy，不会丢数据）',
      description:
        '要新建一份迁移文件用 --new <名字>：只生成不应用，生成后再跑一次 bazi db migrate 应用。',
      flags: [
        {
          name: 'new',
          type: 'string',
          summary: '新建迁移（--create-only，不自动应用，也不会触发交互式重置）',
        },
      ],
      examples: [
        { note: '把待执行迁移跑掉', command: 'bazi db migrate --json' },
        { note: '改完 schema 之后建迁移', command: 'bazi db migrate --new add_user_avatar' },
      ],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        await requireReachable(env);
        const args = flags.new
          ? ['migrate', 'dev', '--create-only', '--name', flags.new]
          : ['migrate', 'deploy'];
        if (flags['dry-run']) {
          return out.ok({ dryRun: true, args }, (d) => `[dry-run] prisma ${d.args.join(' ')}`);
        }
        out.step(`prisma ${args.join(' ')}`);
        const result = await prisma(args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        const text = `${result.stdout}\n${result.stderr}`.trim();
        if (result.code !== 0) {
          throw new CliError('迁移失败', {
            exit: EXIT.FAILED,
            code: 'migrate_failed',
            hint: text.slice(-800),
            next: 'bazi db status --json',
          });
        }
        return out.ok({ args, output: text }, (d) => d.output);
      },
    }),

    defineCommand({
      name: 'reset',
      summary: '清空数据库并重放全部迁移',
      destructive: true,
      description: '会删掉所有数据。默认拒绝执行，必须 --yes；非本地库还要额外 --allow-remote。',
      flags: [{ name: 'allow-remote', type: 'boolean', summary: '允许对非本地数据库执行（危险）' }],
      examples: [{ note: '本地重置', command: 'bazi db reset --yes' }],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        // 先过安全闸，再谈别的。dry-run 也要过，免得给人"加了 --dry-run 就能绕"的错觉。
        const info = assertDestructiveAllowed({
          action: 'db reset',
          env,
          yes: flags.yes,
          allowRemote: flags['allow-remote'],
        });
        await requireReachable(env);
        if (flags['dry-run']) {
          return out.ok(
            { dryRun: true, database: info.redacted },
            (d) => `[dry-run] 会清空并重建 ${d.database}`
          );
        }
        out.warn(`正在重置 ${info.redacted}`);
        const result = await prisma(['migrate', 'reset', '--force', '--skip-seed'], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const text = `${result.stdout}\n${result.stderr}`.trim();
        if (result.code !== 0) {
          throw new CliError('重置失败', {
            exit: EXIT.FAILED,
            code: 'reset_failed',
            hint: text.slice(-800),
            next: 'bazi db status --json',
          });
        }
        return out.ok({ database: info.redacted, output: text }, (d) => `已重置 ${d.database}`);
      },
    }),

    defineCommand({
      name: 'backup',
      summary: '用 pg_dump 打一份自定义格式的备份',
      description: `默认写到 ${path.relative(paths.root, paths.backups)}/ 下，文件名带时间戳。`,
      flags: [{ name: 'out', type: 'string', summary: '指定输出文件路径' }],
      run: async ({ flags, out }) => {
        const env = buildEnv();
        const info = await requireReachable(env);
        requirePgTool('pg_dump');
        ensureStateDirs();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const target = flags.out
          ? path.resolve(paths.root, flags.out)
          : path.join(paths.backups, `${info.database || 'db'}-${stamp}.dump`);
        if (flags['dry-run']) {
          return out.ok({ dryRun: true, target }, (d) => `[dry-run] 会备份到 ${d.target}`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        out.step(`pg_dump -> ${target}`);
        const result = await run(
          'pg_dump',
          ['-Fc', '-f', target, toLibpqUrl(resolveDatabaseUrl(env))],
          {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        if (result.code !== 0) {
          // pg_dump 会先建文件再失败，留下一个 0 字节的"备份"。
          // 半份备份比没有备份更危险 —— 它会让人以为自己有退路。
          fs.rmSync(target, { force: true });
          throw new CliError('pg_dump 失败', {
            exit: EXIT.FAILED,
            code: 'backup_failed',
            hint: (result.stderr || '').trim().slice(-600),
            next: 'bazi db status --json',
          });
        }
        const size = fs.statSync(target).size;
        return out.ok(
          { file: target, bytes: size, database: info.redacted },
          (d) => `已备份 ${d.database} -> ${d.file}（${d.bytes} 字节）`
        );
      },
    }),

    defineCommand({
      name: 'restore',
      summary: '从 pg_dump 备份恢复（会覆盖现有数据）',
      destructive: true,
      usage: 'bazi db restore <备份文件> --yes',
      args: [{ name: 'file', required: true, summary: 'pg_dump -Fc 产出的 .dump 文件' }],
      flags: [{ name: 'allow-remote', type: 'boolean', summary: '允许恢复到非本地数据库（危险）' }],
      run: async ({ positionals, flags, out }) => {
        const file = positionals[0];
        if (!file)
          throw usageError('要给一个备份文件路径', { next: 'bazi db restore <file> --yes' });
        const resolved = path.resolve(paths.root, file);
        if (!fs.existsSync(resolved)) {
          throw usageError(`备份文件不存在：${resolved}`);
        }
        const env = buildEnv();
        const info = assertDestructiveAllowed({
          action: 'db restore',
          env,
          yes: flags.yes,
          allowRemote: flags['allow-remote'],
        });
        await requireReachable(env);
        requirePgTool('pg_restore');
        if (flags['dry-run']) {
          return out.ok(
            { dryRun: true, file: resolved, database: info.redacted },
            (d) => `[dry-run] 会把 ${d.file} 恢复进 ${d.database}`
          );
        }
        out.warn(`正在把 ${resolved} 恢复进 ${info.redacted}`);
        const result = await run(
          'pg_restore',
          [
            '--clean',
            '--if-exists',
            '--no-owner',
            '-d',
            toLibpqUrl(resolveDatabaseUrl(env)),
            resolved,
          ],
          { env, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        // pg_restore 常常带着无害的 warning 返回非 0，把输出原样交给调用方判断。
        const text = `${result.stdout}\n${result.stderr}`.trim();
        if (result.code !== 0) {
          throw new CliError('pg_restore 返回非 0', {
            exit: EXIT.FAILED,
            code: 'restore_failed',
            hint: text.slice(-800),
            next: 'bazi db status --json',
          });
        }
        return out.ok(
          { file: resolved, database: info.redacted, output: text },
          (d) => `已恢复 ${d.file} -> ${d.database}`
        );
      },
    }),

    defineCommand({
      name: 'psql',
      summary: '用当前 DATABASE_URL 打开 psql（交互式，不支持 --json）',
      usage: 'bazi db psql [-- psql 的参数...]',
      run: async ({ flags, passthrough }) => {
        if (flags.json) {
          throw usageError('psql 是交互式的，不能配 --json', { next: 'bazi db status --json' });
        }
        const env = buildEnv();
        await requireReachable(env);
        requirePgTool('psql');
        const result = await run('psql', [toLibpqUrl(resolveDatabaseUrl(env)), ...passthrough], {
          env,
          stdio: 'inherit',
        });
        return result.code === 0 ? EXIT.OK : EXIT.FAILED;
      },
    }),

    defineCommand({
      name: 'generate',
      summary: '重新生成 Prisma Client（改完 schema 必须跑）',
      run: async ({ out }) => {
        const env = buildEnv();
        out.step('prisma generate');
        const result = await prisma(['generate'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        if (result.code !== 0) {
          throw new CliError('prisma generate 失败', {
            exit: EXIT.ENV,
            code: 'generate_failed',
            hint: `${result.stdout}\n${result.stderr}`.trim().slice(-600),
            next: 'bazi setup --skip-install',
          });
        }
        return out.ok(
          { ok: true },
          () => 'Prisma Client 已重新生成。改了 schema 之后记得重启 api。'
        );
      },
    }),
  ],
});

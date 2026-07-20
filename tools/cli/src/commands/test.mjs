import path from 'node:path';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, usageError } from '../core/errors.mjs';
import { run } from '../core/proc.mjs';
import { fileExists, paths } from '../core/context.mjs';

const TARGETS = {
  lint: {
    label: 'ESLint',
    cwd: () => paths.root,
    args: ['run', 'lint'],
  },
  typecheck: {
    label: '前端 TypeScript 类型检查',
    cwd: () => paths.frontend,
    args: ['run', 'typecheck'],
  },
  unit: {
    label: '前端单测（vitest）',
    cwd: () => paths.frontend,
    args: ['run', 'test:unit:run'],
  },
  backend: {
    label: '后端测试（脚本自带临时 PostgreSQL）',
    cwd: () => paths.backend,
    args: ['test'],
    isolatedDb: true,
  },
  e2e: {
    label: 'Playwright 端到端（自带 dev-server，较慢）',
    cwd: () => paths.frontend,
    args: ['test'],
    slow: true,
    isolatedDb: true,
  },
};

const FAST_SET = ['lint', 'typecheck', 'unit', 'backend'];
const ALL_SET = [...FAST_SET, 'e2e'];

/**
 * 测试进程的环境刻意不注入 .env。
 *
 * backend/scripts/run-tests-with-db.mjs 的逻辑是"DATABASE_URL 没设就自己起一个临时库"。
 * 如果把 .env 里的 DATABASE_URL 灌进去，测试就会直接跑在开发库上并对它执行迁移 ——
 * 这是数据事故，不是配置便利。要那样做必须显式 --use-dev-db。
 */
const buildTestEnv = ({ useDevDb }) => {
  const env = { ...process.env };
  if (!useDevDb) delete env.DATABASE_URL;
  return env;
};

export const testCommand = defineCommand({
  name: 'test',
  summary: '跑测试（lint / typecheck / unit / backend / e2e）',
  description:
    '不带参数跑快集合：lint typecheck unit backend。加 --all 或显式写 e2e 才会跑端到端。\n' +
    '测试默认使用隔离的临时数据库，不会碰你的开发库。',
  usage: 'bazi test [目标...] [--all] [-- 透传给底层的参数]',
  args: [{ name: 'targets', summary: '要跑的目标', choices: Object.keys(TARGETS) }],
  flags: [
    { name: 'all', type: 'boolean', summary: '包含 e2e 在内全部跑一遍' },
    { name: 'bail', type: 'boolean', summary: '第一个失败就停，不跑后面的' },
    {
      name: 'use-dev-db',
      type: 'boolean',
      summary: '让测试直连 .env 里的开发库（危险：会对它执行迁移/重置）',
    },
  ],
  examples: [
    { note: '提交前的快检查', command: 'bazi test --json' },
    { note: '只看后端', command: 'bazi test backend' },
    { note: '把参数透传给 playwright', command: 'bazi test e2e -- --grep @smoke' },
  ],
  run: async ({ positionals, passthrough, flags, out }) => {
    const bad = positionals.filter((p) => !TARGETS[p]);
    if (bad.length) {
      throw usageError(`未知测试目标：${bad.join(', ')}`, {
        next: `可选：${Object.keys(TARGETS).join(' / ')}`,
      });
    }
    const targets = positionals.length ? positionals : flags.all ? ALL_SET : FAST_SET;

    if (passthrough.length && targets.length > 1) {
      throw usageError('`--` 透传参数只能配单个目标使用', {
        next: `bazi test ${targets[0]} -- ${passthrough.join(' ')}`,
      });
    }

    if (flags['use-dev-db']) {
      out.warn('--use-dev-db：测试会直接跑在开发库上，可能清空其中数据。');
    }

    const env = buildTestEnv({ useDevDb: flags['use-dev-db'] });
    const results = [];

    for (const name of targets) {
      const target = TARGETS[name];
      const cwd = target.cwd();
      if (!fileExists(path.join(cwd, 'node_modules'))) {
        results.push({ target: name, status: 'skipped', reason: `${cwd} 依赖未安装` });
        out.warn(`${name}: 依赖未安装，跳过（bazi setup --with-frontend）`);
        continue;
      }
      if (flags['dry-run']) {
        results.push({ target: name, status: 'dry-run', command: `npm ${target.args.join(' ')}` });
        continue;
      }

      out.step(`${name} — ${target.label}`);
      const startedAt = Date.now();
      const result = await run(
        'npm',
        [...target.args, ...(passthrough.length ? ['--', ...passthrough] : [])],
        {
          cwd,
          env,
          stdio: out.childStdio,
        }
      );
      const durationMs = Date.now() - startedAt;
      const passed = result.code === 0;
      results.push({
        target: name,
        status: passed ? 'passed' : 'failed',
        exitCode: result.code,
        durationMs,
        // json 模式下子进程输出被 pipe 走了，失败时把尾巴带回来，否则 Agent 什么都看不到
        output: passed
          ? undefined
          : `${result.stdout}\n${result.stderr}`.trim().slice(-4000) || undefined,
      });
      if (!passed && flags.bail) {
        out.warn(`${name} 失败，--bail 生效，停止后续目标`);
        break;
      }
    }

    const failed = results.filter((r) => r.status === 'failed');
    const data = {
      targets,
      results,
      summary: {
        passed: results.filter((r) => r.status === 'passed').length,
        failed: failed.length,
        skipped: results.filter((r) => r.status === 'skipped').length,
      },
    };

    const render = (d) =>
      d.results
        .map(
          (r) =>
            `${out.statusIcon(r.status === 'passed' ? 'ok' : r.status === 'failed' ? 'fail' : 'skip')} ${r.target.padEnd(10)}${r.status}${r.durationMs ? ` (${Math.round(r.durationMs / 1000)}s)` : ''}`
        )
        .join('\n');

    if (failed.length) {
      out.render(data, render);
      throw new CliError(`${failed.length} 个测试目标失败`, {
        exit: EXIT.FAILED,
        code: 'tests_failed',
        hint: failed.map((f) => f.target).join(', '),
        next: `bazi test ${failed[0].target}   # 单独重跑看完整输出`,
        details: data,
      });
    }

    return out.ok(data, render);
  },
});

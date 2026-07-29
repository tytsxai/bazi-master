import path from 'node:path';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, usageError } from '../core/errors.mjs';
import { run } from '../core/proc.mjs';
import { fileExists, paths, readJsonFile } from '../core/context.mjs';

/**
 * script 是 package.json 里的脚本名，用来在跑之前判断这个目标到底存不存在。
 *
 * 导出是给契约测试用的：CLI 声称能跑的每个目标，对应的 npm script 必须真实存在。
 * 不校验的话，删掉一个 script 只会在有人真去跑的时候才炸。
 */
export const TARGETS = {
  cli: {
    label: 'bazi CLI 自测（退出码契约 / JSON 契约 / 安全闸）',
    cwd: () => paths.root,
    script: 'test:cli',
    args: ['run', 'test:cli'],
  },
  lint: {
    label: 'ESLint',
    cwd: () => paths.root,
    script: 'lint',
    args: ['run', 'lint'],
  },
  backend: {
    label: '后端测试（脚本自带临时 PostgreSQL）',
    cwd: () => paths.backend,
    script: 'test',
    args: ['test'],
    isolatedDb: true,
  },
};

// cli 排在最前面：它最快，而且它挂了意味着"你正在用的这个工具本身坏了"，
// 后面几个目标的结论都不再可信，先看到它比先看到 lint 有用。
const DEFAULT_SET = ['cli', 'lint', 'backend'];

/**
 * 目标不可跑的原因 —— 返回 null 表示可跑。
 *
 * 只认 node_modules 是不够的：npm script 被删掉/改名时 `npm run x` 退 1，
 * 会被记成 failed（"代码有问题"），而真实原因是这个目标压根不存在（环境/配置问题）。
 * 两者对 Agent 的下一步动作完全不同，不能混。
 */
const blockedReason = (target, cwd) => {
  if (!fileExists(path.join(cwd, 'node_modules'))) {
    return { reason: `${cwd} 依赖未安装`, next: 'bazi setup' };
  }
  if (!target.script) return null;
  const pkg = readJsonFile(path.join(cwd, 'package.json'));
  if (!pkg) return { reason: `${cwd}/package.json 读不到`, next: 'bazi doctor --json' };
  if (!pkg.scripts?.[target.script]) {
    return {
      reason: `${path.relative(paths.root, cwd) || '.'}/package.json 里没有 "${target.script}" 脚本`,
      next: 'bazi help test --json',
    };
  }
  return null;
};

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
  summary: '跑测试（cli / lint / backend）',
  description:
    '不带参数把三个目标全跑一遍。\n' + '测试默认使用隔离的临时数据库，不会碰你的开发库。',
  usage: 'bazi test [目标...] [-- 透传给底层的参数]',
  args: [{ name: 'targets', summary: '要跑的目标', choices: Object.keys(TARGETS) }],
  flags: [
    { name: 'bail', type: 'boolean', summary: '第一个失败就停，不跑后面的' },
    {
      name: 'fail-on-skip',
      type: 'boolean',
      summary: '有目标因依赖缺失被跳过时也算失败（CI 用，避免"什么都没跑"报成通过）',
    },
    {
      name: 'use-dev-db',
      type: 'boolean',
      summary: '让测试直连 .env 里的开发库（危险：会对它执行迁移/重置）',
    },
  ],
  examples: [
    { note: '提交前的快检查', command: 'bazi test --json' },
    { note: '只看后端', command: 'bazi test backend' },
    { note: '把参数透传给底层 runner', command: 'bazi test backend -- --test-name-pattern=zodiac' },
  ],
  run: async ({ positionals, passthrough, flags, out }) => {
    const bad = positionals.filter((p) => !TARGETS[p]);
    if (bad.length) {
      throw usageError(`未知测试目标：${bad.join(', ')}`, {
        next: `可选：${Object.keys(TARGETS).join(' / ')}`,
      });
    }
    const targets = positionals.length ? positionals : DEFAULT_SET;

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
      const blocked = blockedReason(target, cwd);
      if (blocked) {
        results.push({
          target: name,
          status: 'skipped',
          reason: blocked.reason,
          next: blocked.next,
        });
        out.warn(`${name}: ${blocked.reason}，跳过（${blocked.next}）`);
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
    const skipped = results.filter((r) => r.status === 'skipped');
    const data = {
      targets,
      results,
      summary: {
        passed: results.filter((r) => r.status === 'passed').length,
        failed: failed.length,
        skipped: skipped.length,
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

    // 依赖没装导致的跳过默认只是 warn，本地开发不该被它卡住。
    // 但 CI 里"什么都没跑"和"全跑过了"都返回 0 是最危险的绿灯，所以给一个显式开关。
    // 退出码用 ENV 而不是 FAILED：跳过的原因是环境未就绪，该去装依赖而不是查代码。
    if (skipped.length && flags['fail-on-skip']) {
      out.render(data, render);
      throw new CliError(`${skipped.length} 个测试目标未就绪被跳过`, {
        exit: EXIT.ENV,
        code: 'targets_skipped',
        hint: skipped.map((s) => `${s.target}: ${s.reason}`).join('; '),
        next: skipped[0].next || 'bazi setup',
        details: data,
      });
    }

    return out.ok(data, render);
  },
});

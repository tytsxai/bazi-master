import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT, envError, usageError } from '../core/errors.mjs';
import { buildEnv, fileExists, paths } from '../core/context.mjs';
import { collectStackStatus } from './stack.mjs';

/**
 * 校验脚本不写死清单 —— 直接扫目录。
 * 仓库里新增一个 verify-xxx.mjs，CLI 立刻就能跑它，不需要改 CLI，也不需要改 SKILL.md。
 */
const SOURCES = [
  { scope: 'frontend', dir: () => path.join(paths.frontend, 'scripts'), needs: ['api', 'web'] },
  { scope: 'backend', dir: () => path.join(paths.backend, 'scripts'), needs: ['db'] },
];

const discover = () => {
  const found = [];
  for (const source of SOURCES) {
    const dir = source.dir();
    if (!fileExists(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.startsWith('verify-') || !file.endsWith('.mjs')) continue;
      found.push({
        name: file.slice('verify-'.length, -'.mjs'.length),
        scope: source.scope,
        needs: source.needs,
        file: path.join(dir, file),
        cwd: path.dirname(dir),
      });
    }
  }
  return found;
};

const selectScripts = (names, scope) => {
  const all = discover();
  const pool = scope ? all.filter((s) => s.scope === scope) : all;
  if (!names.length) return pool;
  const selected = [];
  for (const name of names) {
    const match = pool.find((s) => s.name === name);
    if (!match) {
      throw usageError(`没有名为 "${name}" 的校验脚本`, { next: 'bazi verify list --json' });
    }
    selected.push(match);
  }
  return selected;
};

/**
 * 前置断言。
 *
 * frontend/scripts/verify-*.mjs 全都直接打 http://localhost:3000 —— 它们自己不会把栈拉起来。
 * 没有这道检查，栈没起时的表现是 playwright 超时后吐一大堆无关报错，Agent 会误判成功能坏了。
 */
const assertDependencies = async (scripts) => {
  const needed = new Set(scripts.flatMap((s) => s.needs));
  if (!needed.size) return;
  const status = await collectStackStatus(buildEnv());
  const missing = status.components.filter((c) => needed.has(c.name) && !c.running);
  if (missing.length) {
    throw envError(`校验脚本需要 ${[...needed].join(' / ')} 在跑，但 ${missing.map((m) => m.name).join(' / ')} 没起来`, {
      hint: missing.map((m) => `${m.name}: ${m.detail}`).join('; '),
      next: 'bazi stack up',
      details: { status },
    });
  }
};

const runScript = (script, { env, timeoutMs, stdio }) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [script.file], { cwd: script.cwd, env, stdio });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (c) => (stdout += c));
    if (child.stderr) child.stderr.on('data', (c) => (stderr += c));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: 124, timedOut: true, stdout, stderr });
    }, timeoutMs);
    child.on('error', (error) =>
      resolve({ code: 127, timedOut: false, stdout, stderr: error.message })
    );
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, timedOut: false, stdout, stderr });
    });
  });

const executeAll = async ({ scripts, flags, out }) => {
  await assertDependencies(scripts);
  const env = buildEnv();
  const timeoutMs = Number(flags.timeout || 300) * 1000;
  const results = [];

  for (const script of scripts) {
    if (flags['dry-run']) {
      results.push({ name: script.name, scope: script.scope, status: 'dry-run' });
      continue;
    }
    out.step(`verify ${script.name}（${script.scope}）`);
    const startedAt = Date.now();
    const result = await runScript(script, { env, timeoutMs, stdio: out.childStdio });
    const durationMs = Date.now() - startedAt;
    const status = result.timedOut ? 'timeout' : result.code === 0 ? 'passed' : 'failed';
    results.push({
      name: script.name,
      scope: script.scope,
      status,
      exitCode: result.code,
      durationMs,
      output:
        status === 'passed'
          ? undefined
          : `${result.stdout}\n${result.stderr}`.trim().slice(-3000) || undefined,
    });
    if (status !== 'passed' && flags.bail) {
      out.warn(`${script.name} ${status}，--bail 生效`);
      break;
    }
  }

  const bad = results.filter((r) => r.status === 'failed' || r.status === 'timeout');
  const data = {
    results,
    summary: {
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      timeout: results.filter((r) => r.status === 'timeout').length,
    },
  };
  const render = (d) =>
    d.results
      .map(
        (r) =>
          `${out.statusIcon(r.status === 'passed' ? 'ok' : 'fail')} ${r.name.padEnd(30)}${r.status}${r.durationMs ? ` (${Math.round(r.durationMs / 1000)}s)` : ''}`
      )
      .join('\n');

  if (bad.length) {
    out.render(data, render);
    throw new CliError(`${bad.length} 个校验脚本未通过`, {
      exit: EXIT.FAILED,
      code: 'verify_failed',
      hint: bad.map((b) => `${b.name}:${b.status}`).join(', '),
      next: `bazi verify run ${bad[0].name}   # 单独重跑看完整输出`,
      details: data,
    });
  }
  return out.ok(data, render);
};

export const verifyCommand = defineCommand({
  name: 'verify',
  summary: '跑仓库里的端到端校验脚本（verify-*.mjs）',
  description:
    '脚本清单是扫目录得来的，不是写死的：新增 scripts/verify-xxx.mjs 立刻可用。\n' +
    'frontend 系脚本会直接访问 http://localhost:3000，跑之前 CLI 会强制检查栈是否就绪。',
  commands: [
    defineCommand({
      name: 'list',
      summary: '列出所有可跑的校验脚本',
      flags: [{ name: 'scope', type: 'string', summary: '只看 frontend 或 backend' }],
      run: ({ flags, out }) => {
        const scripts = discover().filter((s) => !flags.scope || s.scope === flags.scope);
        return out.ok(
          { count: scripts.length, scripts: scripts.map(({ name, scope, needs, file }) => ({ name, scope, needs, file })) },
          (d) =>
            d.scripts
              .map((s) => `${s.scope.padEnd(9)} ${s.name.padEnd(32)} 需要: ${s.needs.join(',')}`)
              .join('\n') || '（没有发现 verify-*.mjs）'
        );
      },
    }),

    defineCommand({
      name: 'run',
      summary: '跑指定的校验脚本',
      usage: 'bazi verify run <名字> [名字...]',
      args: [{ name: 'names', required: true, summary: '来自 bazi verify list 的名字' }],
      flags: [
        { name: 'timeout', type: 'number', summary: '单个脚本超时秒数', default: 300 },
        { name: 'bail', type: 'boolean', summary: '第一个失败就停' },
      ],
      examples: [{ note: '跑一个', command: 'bazi verify run guest-menu' }],
      run: async ({ positionals, flags, out }) => {
        if (!positionals.length) {
          throw usageError('要给至少一个脚本名', { next: 'bazi verify list' });
        }
        return executeAll({ scripts: selectScripts(positionals, null), flags, out });
      },
    }),

    defineCommand({
      name: 'all',
      summary: '按顺序跑全部校验脚本（慢，串行，避免互相踩状态）',
      flags: [
        { name: 'scope', type: 'string', summary: '只跑 frontend 或 backend' },
        { name: 'timeout', type: 'number', summary: '单个脚本超时秒数', default: 300 },
        { name: 'bail', type: 'boolean', summary: '第一个失败就停' },
      ],
      run: async ({ flags, out }) => {
        const scripts = selectScripts([], flags.scope || null);
        if (!scripts.length) {
          throw usageError(`没有匹配的校验脚本${flags.scope ? `（scope=${flags.scope}）` : ''}`, {
            next: 'bazi verify list',
          });
        }
        return executeAll({ scripts, flags, out });
      },
    }),
  ],
});

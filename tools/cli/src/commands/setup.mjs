import { defineCommand } from '../core/registry.mjs';
import { CliError, EXIT } from '../core/errors.mjs';
import { run } from '../core/proc.mjs';
import { fileExists, paths } from '../core/context.mjs';
import { initEnvFile } from './env.mjs';
import path from 'node:path';

/** 每一步都幂等：已经就绪就跳过，可以反复跑。 */
const buildSteps = ({ skipInstall }) => {
  const steps = [];

  if (!skipInstall) {
    steps.push({
      id: 'install:root',
      label: '安装根依赖',
      skipIf: () => fileExists(path.join(paths.root, 'node_modules')),
      exec: (opts) =>
        run('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.root, ...opts }),
    });
    steps.push({
      id: 'install:backend',
      label: '安装后端依赖',
      skipIf: () => fileExists(path.join(paths.backend, 'node_modules')),
      exec: (opts) =>
        run('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.backend, ...opts }),
    });
  }

  steps.push({
    id: 'env',
    label: '准备 .env',
    exec: async () => {
      const result = initEnvFile();
      return {
        code: 0,
        note: result.created ? '已创建' : result.changed.length ? '已补齐' : '已存在',
      };
    },
  });

  return steps;
};

export const setupCommand = defineCommand({
  name: 'setup',
  summary: '一次性把本地开发环境准备好（幂等，可反复跑）',
  description: '装依赖 -> 建 .env。\n不启动任何服务；起引擎用 bazi stack up。',
  flags: [
    {
      name: 'skip-install',
      type: 'boolean',
      summary: '跳过 npm install，只准备 .env',
    },
  ],
  examples: [
    { note: '第一次上手', command: 'bazi setup' },
    { note: '依赖已装好，只补 .env', command: 'bazi setup --skip-install' },
  ],
  run: async ({ flags, out }) => {
    const steps = buildSteps({ skipInstall: flags['skip-install'] });
    const executed = [];

    for (const step of steps) {
      if (step.skipIf?.()) {
        executed.push({ id: step.id, status: 'skipped', note: '已就绪' });
        out.step(`${step.label} — 已就绪，跳过`);
        continue;
      }
      if (flags['dry-run']) {
        executed.push({ id: step.id, status: 'dry-run' });
        out.step(`[dry-run] ${step.label}`);
        continue;
      }
      out.step(step.label);
      const result = await step.exec({ stdio: out.childStdio });
      if (result.code !== 0) {
        executed.push({ id: step.id, status: 'failed' });
        throw new CliError(`${step.label} 失败`, {
          exit: EXIT.ENV,
          code: 'setup_step_failed',
          hint: (result.stderr || '').trim().slice(-600) || `退出码 ${result.code}`,
          next: 'bazi doctor --json  # 看具体缺什么',
          details: { step: step.id, executed },
        });
      }
      executed.push({ id: step.id, status: 'done', note: result.note });
    }

    return out.ok({ steps: executed }, (d) => {
      const lines = d.steps.map(
        (s) =>
          `${s.status === 'failed' ? '✗' : '✓'} ${s.id.padEnd(20)} ${s.status}${s.note ? ` (${s.note})` : ''}`
      );
      lines.push('', '下一步: bazi stack up    然后 bazi stack status');
      return lines.join('\n');
    });
  },
});

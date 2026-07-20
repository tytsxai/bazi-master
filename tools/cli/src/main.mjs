import { createOutput } from './core/output.mjs';
import { CliError, EXIT } from './core/errors.mjs';
import {
  defineCommand,
  parseArgs,
  renderHelp,
  resolveCommand,
  toJsonTree,
} from './core/registry.mjs';

import { setupCommand } from './commands/setup.mjs';
import { doctorCommand } from './commands/doctor.mjs';
import { envCommand } from './commands/env.mjs';
import { stackCommand } from './commands/stack.mjs';
import { dbCommand } from './commands/db.mjs';
import { testCommand } from './commands/test.mjs';
import { verifyCommand } from './commands/verify.mjs';
import { helpCommand } from './commands/help.mjs';

export const rootCommand = defineCommand({
  name: 'bazi',
  summary: 'bazi-master 项目的程序化 CLI —— 面向 AI Agent 调用设计',
  description:
    '所有命令都支持 --json（stdout 只有一个 JSON 文档，进度与噪音走 stderr）。\n' +
    '退出码是契约：0 成功 / 1 结果失败 / 2 用法错 / 3 环境未就绪 / 4 远端拒绝 / 5 可重试 / 7 命中安全边界。',
  commands: [
    setupCommand,
    doctorCommand,
    envCommand,
    stackCommand,
    dbCommand,
    testCommand,
    verifyCommand,
    helpCommand,
  ],
  examples: [
    { note: '第一次上手', command: 'bazi setup && bazi doctor' },
    { note: '拿到完整能力清单', command: 'bazi help --json' },
  ],
});

/** 命令解析之前就要知道输出模式，否则解析阶段的报错没法按 json 契约输出。 */
const presniffOutputMode = (argv) => {
  const stop = argv.indexOf('--');
  const scope = stop >= 0 ? argv.slice(0, stop) : argv;
  return {
    json: scope.includes('--json'),
    quiet: scope.includes('--quiet') || scope.includes('-q'),
  };
};

export const main = async (argv) => {
  const mode = presniffOutputMode(argv);
  const { node, commandPath, rest } = resolveCommand(rootCommand, argv);
  const out = createOutput({
    json: mode.json,
    quiet: mode.quiet,
    command: ['bazi', ...commandPath].join(' '),
  });

  try {
    const { flags, positionals, passthrough } = parseArgs(node, rest);

    // 没有 run 的节点是分组（root、env、stack…），只能展示帮助。
    if (!node.run && !flags.help && positionals.length) {
      throw new CliError(`没有名为 "${positionals[0]}" 的${commandPath.length ? '子' : ''}命令`, {
        exit: EXIT.USAGE,
        code: 'unknown_command',
        next: `bazi ${[...commandPath, '--help'].join(' ')}`,
      });
    }

    const wantsHelp = flags.help || !node.run;
    if (wantsHelp) {
      if (flags.json) {
        process.stdout.write(`${JSON.stringify(toJsonTree(node, commandPath), null, 2)}\n`);
        return EXIT.OK;
      }
      process.stdout.write(`${renderHelp(node, commandPath)}\n`);
      // 显式要 help，或者裸跑 `bazi`：都算正常。分组下写了个不存在的子命令：用法错。
      return flags.help || node === rootCommand ? EXIT.OK : EXIT.USAGE;
    }

    const code = await node.run({
      flags,
      positionals,
      passthrough,
      out,
      commandPath,
      node,
      root: rootCommand,
    });
    return typeof code === 'number' ? code : EXIT.OK;
  } catch (error) {
    if (error instanceof CliError) return out.fail(error);
    // 非预期异常：不吞掉，但仍然按契约格式输出，Agent 才能统一处理。
    return out.fail(
      new CliError(error?.message || String(error), {
        exit: EXIT.FAILED,
        code: 'unexpected',
        hint: '这是未预期的内部错误，不是可预期的失败路径。',
        next: 'BAZI_CLI_TRACE=1 重跑可以看到堆栈',
        details: { stack: process.env.BAZI_CLI_TRACE ? error?.stack : undefined },
      })
    );
  }
};

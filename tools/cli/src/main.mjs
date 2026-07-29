import { createOutput } from './core/output.mjs';
import { CliError, EXIT } from './core/errors.mjs';
import { defineCommand, parseArgs, renderHelp, resolveCommand } from './core/registry.mjs';

import { calcCommand } from './commands/calc.mjs';
import { castCommand } from './commands/cast.mjs';
import { setupCommand } from './commands/setup.mjs';
import { doctorCommand } from './commands/doctor.mjs';
import { envCommand } from './commands/env.mjs';
import { stackCommand } from './commands/stack.mjs';
import { testCommand } from './commands/test.mjs';
import { helpCommand, helpPayload } from './commands/help.mjs';

export const rootCommand = defineCommand({
  name: 'bazi',
  summary: 'bazi-master 项目的程序化 CLI —— 面向 AI Agent 调用设计',
  description:
    '两类命令：calc / cast 是这个项目对外输出的算法能力，其余是维护本仓库的运维命令。\n' +
    '所有命令都支持 --json（stdout 只有一个 JSON 文档，进度与噪音走 stderr）。\n' +
    '退出码是契约：0 成功 / 1 结果失败 / 2 用法错 / 3 环境未就绪 / 4 远端拒绝 / 5 可重试 / 7 命中安全边界。',
  commands: [
    calcCommand,
    castCommand,
    setupCommand,
    doctorCommand,
    envCommand,
    stackCommand,
    testCommand,
    helpCommand,
  ],
  examples: [
    { note: '第一次上手', command: 'bazi setup && bazi doctor' },
    {
      note: '调用算法能力（引擎要先起着）',
      command: 'bazi calc bazi --birth 1990-05-20T14:30 --gender male --json',
    },
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

    // 没有 run 的节点是分组（root、env、stack、calc…），只能展示帮助。
    if (!node.run && !flags.help && positionals.length) {
      throw new CliError(`没有名为 "${positionals[0]}" 的${commandPath.length ? '子' : ''}命令`, {
        exit: EXIT.USAGE,
        code: 'unknown_command',
        next: `bazi ${[...commandPath, '--help'].join(' ')}`,
      });
    }

    if (flags.help || !node.run) {
      // 显式要 help，或者裸跑 `bazi`：都算正常收尾。
      if (flags.help || node === rootCommand) {
        if (flags.json) {
          // 和 `bazi help --json` 共用同一个信封，否则 Agent 解析 .ok 会拿到 undefined
          process.stdout.write(`${JSON.stringify(helpPayload(node, commandPath), null, 2)}\n`);
          return EXIT.OK;
        }
        process.stdout.write(`${renderHelp(node, commandPath)}\n`);
        return EXIT.OK;
      }

      // 分组节点（stack / env / calc…）没带子命令：用法错。
      // 人还是要看到子命令列表，所以文本模式先打帮助再失败；json 模式只出错误信封，
      // 否则 stdout 会同时出现帮助文本和 JSON，解析契约就破了。
      out.render({}, () => renderHelp(node, commandPath));
      throw new CliError(`\`bazi ${commandPath.join(' ')}\` 是命令分组，需要一个子命令`, {
        exit: EXIT.USAGE,
        code: 'missing_subcommand',
        hint: `可用子命令：${node.commands.map((c) => c.name).join(' / ')}`,
        next: `bazi help ${commandPath.join(' ')} --json`,
        details: { available: node.commands.map((c) => c.name) },
      });
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

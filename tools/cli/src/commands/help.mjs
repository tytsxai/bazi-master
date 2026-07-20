import { defineCommand, renderHelp, resolveCommand, toJsonTree } from '../core/registry.mjs';
import { EXIT_MEANING } from '../core/errors.mjs';
import { usageError } from '../core/errors.mjs';

/**
 * 能力清单的唯一真源。
 *
 * SKILL.md 刻意不抄命令列表 —— 抄了就会腐化。Agent 想知道"能做什么"，
 * 永远是跑 `bazi help --json`，而不是读文档里的表格。
 */
export const helpCommand = defineCommand({
  name: 'help',
  summary: '输出命令树；--json 是机器可读的完整能力清单',
  description:
    '不带参数输出顶层帮助；带命令路径输出那一条的帮助。\n' +
    '--json 额外附带退出码含义表，Agent 靠它把退出码翻译成下一步动作。',
  usage: 'bazi help [命令路径...] [--json]',
  args: [{ name: 'command', summary: '命令路径，如 `help stack up`' }],
  examples: [
    { note: '拿到全部能力（Agent 首选）', command: 'bazi help --json' },
    { note: '只看某条命令', command: 'bazi help stack up' },
  ],
  run: ({ positionals, flags, out, root }) => {
    const { node, commandPath, rest } = resolveCommand(root, positionals);
    if (rest.length) {
      throw usageError(`没有名为 "${rest[0]}" 的命令`, { next: 'bazi help --json' });
    }

    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            command: 'bazi help',
            data: {
              cli: 'bazi',
              exitCodes: EXIT_MEANING,
              tree: toJsonTree(node, commandPath),
            },
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    process.stdout.write(`${renderHelp(node, commandPath)}\n`);
    return out.ok({}, () => '');
  },
});

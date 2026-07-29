import assert from 'node:assert/strict';
import test from 'node:test';

import { bazi, baziJson } from './helpers.mjs';

/**
 * CLI 与 Agent 之间的契约测试。
 *
 * 这里测的不是业务正确性，是"Agent 还能不能理解这个工具"：
 *   - --json 的 stdout 永远只有一个 JSON 文档
 *   - 退出码永远表达同一个意思
 *   - 失败负载永远带 code / exit / next
 *
 * 这三条一旦破了，所有调用方会同时瞎掉，而且症状是"JSON 解析失败"这种最难归因的错。
 */

/**
 * 只读或 dry-run 的命令 —— 跑它们不会改任何东西。
 * 退出码可能是 0 也可能是 3（环境没准备好），这里不关心；
 * 关心的是不管成功失败，stdout 都必须是一个能解析的 JSON 文档。
 */
const READONLY_COMMANDS = [
  [],
  ['help'],
  ['help', 'env', 'init'],
  ['doctor', '--only', 'node'],
  ['env', 'show'],
  ['env', 'check'],
  ['stack', 'status'],
  ['stack', 'logs'],
  ['test', '--dry-run'],
  ['setup', '--dry-run'],
  ['env', 'init', '--force', '--dry-run'],
];

test('--json 模式下 stdout 只有一个 JSON 文档', async (t) => {
  for (const args of READONLY_COMMANDS) {
    await t.test(`bazi ${args.join(' ')} --json`, () => {
      const { payload } = baziJson(args);
      assert.equal(typeof payload, 'object');
      assert.notEqual(payload, null);
      assert.equal(typeof payload.ok, 'boolean', 'payload 必须有布尔 ok 字段');
      assert.equal(typeof payload.command, 'string');
      assert.match(payload.command, /^bazi\b/);
    });
  }
});

test('--json 模式下进度和噪音只走 stderr', () => {
  // doctor 会 spawn 子进程并做一堆网络/端口探测，是最容易漏出 stdout 的那个
  baziJson(['doctor']);

  // 一条确定会往 stderr 写进度的命令。baziJson 本身就断言了 stdout 能被 JSON.parse，
  // 任何一行进度漏进 stdout 都会当场炸；这里再确认进度确实走到了 stderr：
  // 人看 stderr，Agent 读 stdout 上那份 JSON。
  const noisy = baziJson(['setup', '--dry-run']);
  assert.equal(noisy.payload.ok, true);
  assert.match(noisy.stderr, /dry-run/, '进度必须出现在 stderr');
});

test('失败负载带齐 Agent 需要的字段', () => {
  const { code, payload } = baziJson(['nope']);
  assert.equal(code, 2);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'unknown_command');
  assert.equal(payload.exit, 2);
  assert.equal(typeof payload.exitMeaning, 'string');
  assert.equal(typeof payload.next, 'string');
  assert.equal(Array.isArray(payload.notes), true);
});

test('payload.exit 必须等于进程真实退出码', async (t) => {
  const cases = [
    ['nope'],
    ['doctor', '--nope'],
    ['env'],
    ['test', 'nosuchtarget'],
    ['env', 'init', '--force'],
  ];
  for (const args of cases) {
    await t.test(`bazi ${args.join(' ')}`, () => {
      const { code, payload } = baziJson(args);
      assert.equal(payload.ok, false);
      assert.equal(
        payload.exit,
        code,
        `payload.exit=${payload.exit} 与进程退出码 ${code} 不一致，Agent 会读到互相矛盾的信号`
      );
    });
  }
});

test('退出码语义', async (t) => {
  const cases = [
    { args: [], code: 0, why: '裸跑输出顶层帮助，算正常' },
    { args: ['help'], code: 0, why: 'help 正常收尾' },
    { args: ['nope'], code: 2, why: '不存在的命令是用法错' },
    { args: ['env', 'nope'], code: 2, why: '不存在的子命令是用法错' },
    { args: ['env'], code: 2, why: '分组节点缺子命令是用法错' },
    { args: ['stack'], code: 2, why: '同上' },
    { args: ['doctor', '--nope'], code: 2, why: '未知选项是用法错' },
    { args: ['doctor', '--only'], code: 2, why: '选项缺取值是用法错' },
    { args: ['test', 'nosuchtarget'], code: 2, why: '不存在的测试目标是用法错' },
    { args: ['stack', 'logs', 'db'], code: 2, why: '已删除的组件参数必须报用法错，不能被静默忽略' },
    { args: ['env', 'init', '--force'], code: 7, why: '破坏性操作没确认要命中安全边界' },
  ];
  for (const { args, code, why } of cases) {
    await t.test(`bazi ${args.join(' ')} -> ${code}（${why}）`, () => {
      assert.equal(baziJson(args).code, code, why);
    });
  }
});

test('json 与文本两种模式的退出码必须一致', async (t) => {
  // 曾经出过：`bazi env` 退 2，但 `bazi env --json` 退 0。
  // Agent 用 --json，人不用，两边看到的结论不能相反。
  const cases = [
    [],
    ['env'],
    ['stack'],
    ['nope'],
    ['doctor', '--nope'],
    ['env', 'init', '--force'],
  ];
  for (const args of cases) {
    await t.test(`bazi ${args.join(' ')}`, () => {
      const text = bazi(args);
      const json = bazi([...args, '--json']);
      assert.equal(
        json.code,
        text.code,
        `--json 退 ${json.code}，文本模式退 ${text.code}，两者必须相同`
      );
    });
  }
});

test('失败时给出的 next 必须是一条真实存在的命令', () => {
  const { payload: help } = baziJson(['help']);
  const root = help.data.tree;
  const exists = (command) => {
    const tokens = command.trim().split(/\s+/);
    if (tokens[0] !== 'bazi') return true; // 不是 bazi 命令（比如提示装依赖），不在这里管
    let node = root;
    for (const token of tokens.slice(1)) {
      if (token.startsWith('-')) return true; // 走到选项，说明前面的命令路径已经合法
      const child = (node.commands || []).find((c) => c.name === token);
      if (!child) return node !== root; // 位置参数：只要之前落到过真实命令就算数
      node = child;
    }
    return true;
  };

  const failing = [
    ['nope'],
    ['env'],
    ['env', 'init', '--force'],
    ['test', 'nosuchtarget'],
    ['doctor', '--nope'],
  ];
  for (const args of failing) {
    const { payload } = baziJson(args);
    assert.equal(payload.ok, false);
    if (payload.next) {
      assert.equal(
        exists(payload.next),
        true,
        `bazi ${args.join(' ')} 的 next 指向了不存在的命令：${payload.next}`
      );
    }
  }
});

test('-- 之后的参数原样透传，不被当成本命令的选项', () => {
  // --nope 在 -- 之后，不应该触发"未知选项"。
  // 注意 --json 必须写在 -- 之前，否则它自己也会被透传掉。
  const result = bazi(['test', 'backend', '--dry-run', '--json', '--', '--nope']);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
});

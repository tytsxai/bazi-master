import assert from 'node:assert/strict';
import test from 'node:test';

import { bazi, baziJson, walkTree } from './helpers.mjs';

/**
 * 能力清单的完整性。
 *
 * SKILL.md 刻意不抄命令列表，所有调用方都只认 `bazi help --json`。
 * 那份 JSON 漏了什么，对 Agent 来说就等于那个能力不存在 —— 所以它得自己有测试。
 */

const tree = () => baziJson(['help']).payload.data.tree;

test('help --json 的信封稳定', () => {
  const { payload } = baziJson(['help']);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.cli, 'bazi');
  for (const code of [0, 1, 2, 3, 4, 5, 7]) {
    assert.equal(typeof payload.data.exitCodes[code], 'string', `退出码 ${code} 缺少含义说明`);
  }
});

test('help --json 必须带上全局标志', () => {
  // 漏了这个，Agent 就发现不了 --yes / --dry-run，
  // 而它们是遇到 exit 7 时唯一的出路。
  const globalFlags = tree().globalFlags;
  assert.equal(Array.isArray(globalFlags), true, 'tree.globalFlags 缺失');
  const names = globalFlags.map((f) => f.name);
  for (const required of ['json', 'quiet', 'dry-run', 'yes', 'help']) {
    assert.equal(names.includes(required), true, `全局标志 --${required} 没出现在能力清单里`);
  }
  for (const flag of globalFlags) {
    assert.equal(typeof flag.summary, 'string');
    assert.notEqual(flag.summary, '', `--${flag.name} 缺少说明`);
  }
});

test('全局标志只在树根出现一次', () => {
  walkTree(tree(), (node, depth) => {
    if (depth === 0) return;
    assert.equal(node.globalFlags, undefined, `${node.path} 不该重复挂 globalFlags`);
  });
});

test('子命令的帮助也带同一个信封', async (t) => {
  for (const args of [
    ['help', 'db'],
    ['help', 'db', 'reset'],
    ['help', 'stack', 'up'],
  ]) {
    await t.test(`bazi ${args.join(' ')} --json`, () => {
      const { payload } = baziJson(args);
      assert.equal(payload.ok, true);
      assert.equal(Array.isArray(payload.data.tree.globalFlags), true);
      assert.equal(typeof payload.data.exitCodes, 'object');
    });
  }
});

test('`bazi --json` 与 `bazi help --json` 输出一致', () => {
  // 两条路径以前给的形状不一样：一个有 ok/command/data 信封，一个是裸命令树。
  const bare = JSON.parse(bazi(['--json']).stdout);
  const viaHelp = baziJson(['help']).payload;
  assert.deepEqual(bare, viaHelp);
});

test('每个节点都自我描述完整', () => {
  walkTree(tree(), (node) => {
    assert.equal(typeof node.summary, 'string');
    assert.notEqual(node.summary.trim(), '', `${node.path || 'bazi'} 缺少 summary`);
    for (const flag of node.flags || []) {
      assert.notEqual(
        (flag.summary || '').trim(),
        '',
        `${node.path} 的 --${flag.name} 缺少说明，Agent 只能靠猜`
      );
      assert.equal(typeof flag.type, 'string', `${node.path} 的 --${flag.name} 缺少 type`);
    }
  });
});

test('node.path 与它在树里的位置一致', () => {
  const visit = (node, prefix) => {
    assert.equal(node.path, prefix.join(' '), `${node.name} 的 path 字段与实际位置不符`);
    for (const child of node.commands || []) visit(child, [...prefix, child.name]);
  };
  const root = tree();
  for (const child of root.commands || []) visit(child, [child.name]);
});

test('命令自己的标志不能和全局标志重名', () => {
  // 重名会被 flagSpecFor 的查找顺序静默吃掉（全局在前），
  // 表现是"这个选项写了没用"，非常难查。
  const root = tree();
  const globals = new Set(root.globalFlags.flatMap((f) => [f.name, f.alias].filter(Boolean)));
  walkTree(root, (node) => {
    for (const flag of node.flags || []) {
      assert.equal(
        globals.has(flag.name),
        false,
        `${node.path} 的 --${flag.name} 与全局标志重名，会被静默覆盖`
      );
      if (flag.alias) {
        assert.equal(
          globals.has(flag.alias),
          false,
          `${node.path} 的 -${flag.alias} 与全局别名重名`
        );
      }
    }
  });
});

test('破坏性命令必须打上 destructive 标记', () => {
  const marked = [];
  walkTree(tree(), (node) => {
    if (node.destructive) marked.push(node.path);
  });
  // Agent 靠这个字段在动手前识别"这条要先问人"，不能靠命令名去猜
  assert.deepEqual(marked.sort(), ['db reset', 'db restore']);
  walkTree(tree(), (node) => {
    if (!node.destructive) return;
    assert.match(
      `${node.description || ''}${node.usage || ''}`,
      /--yes/,
      `${node.path} 标了 destructive，说明里却没讲清楚怎么确认`
    );
  });
});

test('文档里的示例命令都真实存在', () => {
  // 示例是 Agent 最容易照抄的东西，抄到一条不存在的命令就是白跑一轮。
  const root = tree();
  const resolve = (tokens) => {
    let node = root;
    for (const token of tokens) {
      if (token.startsWith('-')) break;
      const child = (node.commands || []).find((c) => c.name === token);
      if (!child) break; // 后面是位置参数
      node = child;
    }
    return node;
  };

  const problems = [];
  walkTree(root, (node) => {
    for (const example of node.examples || []) {
      const command = typeof example === 'string' ? example : example.command;
      for (const piece of command.split('&&')) {
        const tokens = piece.trim().split(/\s+/);
        if (tokens[0] !== 'bazi') continue;
        const target = resolve(tokens.slice(1));
        if (target === root) {
          problems.push(`${node.path || 'bazi'} 的示例指向了不存在的命令：${piece.trim()}`);
          continue;
        }
        // 这个 CLI 里"可执行节点"等价于"叶子节点"，分组节点必须带子命令才能跑
        if (target.commands) {
          problems.push(`${node.path || 'bazi'} 的示例停在了命令分组上：${piece.trim()}`);
        }
      }
    }
  });
  assert.deepEqual(problems, []);
});

test('示例里用到的标志都是真实存在的', () => {
  const root = tree();
  const globals = new Set(root.globalFlags.map((f) => f.name));
  const problems = [];

  const resolveNode = (tokens) => {
    let node = root;
    for (const token of tokens) {
      if (token.startsWith('-')) break;
      const child = (node.commands || []).find((c) => c.name === token);
      if (!child) break;
      node = child;
    }
    return node;
  };

  walkTree(root, (node) => {
    for (const example of node.examples || []) {
      const command = typeof example === 'string' ? example : example.command;
      for (const piece of command.split('&&')) {
        const tokens = piece.trim().split(/\s+/);
        if (tokens[0] !== 'bazi') continue;
        const target = resolveNode(tokens.slice(1));
        const own = new Set((target.flags || []).map((f) => f.name));
        const stop = tokens.indexOf('--'); // -- 之后是透传给底层工具的，不归 CLI 管
        const scope = stop >= 0 ? tokens.slice(0, stop) : tokens;
        for (const token of scope) {
          if (!token.startsWith('--')) continue;
          const name = token.slice(2).split('=')[0];
          if (!own.has(name) && !globals.has(name)) {
            problems.push(
              `${node.path || 'bazi'} 的示例用了不存在的选项 --${name}：${piece.trim()}`
            );
          }
        }
      }
    }
  });
  assert.deepEqual(problems, []);
});

test('文本帮助也把全局标志打出来', () => {
  const { stdout, code } = bazi(['help', 'db', 'reset']);
  assert.equal(code, 0);
  assert.match(stdout, /通用选项/);
  assert.match(stdout, /--yes/);
  assert.match(stdout, /--dry-run/);
});

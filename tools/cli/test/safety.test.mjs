import assert from 'node:assert/strict';
import test from 'node:test';

import { baziJson } from './helpers.mjs';

/**
 * 安全闸回归网。
 *
 * assertDestructiveAllowed 是整个 CLI 里唯一"拦得住 Agent"的东西，
 * 而它的两道闸有先后顺序、有互相影响，改一行就可能悄悄失效。
 *
 * 引擎收敛成无状态计算层之后，这道闸守的目标从数据库换成了 `.env` —— 它是仓库里
 * 唯一一份存着真实 API Key 的文件，`env init --force` 会把它整份覆盖掉。
 *
 * 这里所有用例都不会真的覆盖 .env：
 *   - 命中闸的用例在执行之前就抛了
 *   - 放行的用例一律带 --dry-run，dry-run 分支在写文件之前 return
 */

const dev = { NODE_ENV: 'development' };

test('没有 --yes 时破坏性命令一律退 7', () => {
  const { code, payload } = baziJson(['env', 'init', '--force'], { env: dev });
  assert.equal(code, 7);
  assert.equal(payload.code, 'blocked');
  assert.match(payload.error, /破坏性操作/);
});

test('exit 7 给出的下一步必须是 Agent 真能安全执行的', () => {
  // 这条曾经写着"只想看会做什么就加 --dry-run"，但当时 --dry-run 也会被同一道闸拦住，
  // 照着做会拿到一模一样的 7 —— 一个死循环。
  const { payload } = baziJson(['env', 'init', '--force'], { env: dev });
  assert.match(payload.next, /--dry-run/);
  assert.equal(payload.details.dryRunAvailable, true);

  const preview = baziJson(['env', 'init', '--force', '--dry-run'], { env: dev });
  assert.equal(preview.code, 0, 'next 建议的 --dry-run 必须真的能跑通');
  assert.equal(preview.payload.ok, true);
  assert.equal(preview.payload.data.dryRun, true);
  assert.equal(
    preview.payload.data.wouldOverwrite,
    true,
    'dry-run 必须说清楚会不会覆盖，否则预览等于没预览'
  );
});

test('--dry-run 只能越过确认闸，越不过 production 那道', () => {
  const { code, payload } = baziJson(['env', 'init', '--force', '--dry-run'], {
    env: { NODE_ENV: 'production' },
  });
  assert.equal(code, 7);
  assert.match(payload.error, /production/);
});

test('NODE_ENV=production 下加什么参数都拒绝', async (t) => {
  const combos = [
    ['env', 'init', '--force', '--yes'],
    ['env', 'init', '--force', '--yes', '--dry-run'],
    ['env', 'init', '--force', '--dry-run'],
  ];
  for (const args of combos) {
    await t.test(`bazi ${args.join(' ')}`, () => {
      const { code, payload } = baziJson(args, { env: { NODE_ENV: 'production' } });
      assert.equal(code, 7, 'production 是硬边界，任何参数组合都不能放行');
      assert.equal(payload.code, 'blocked');
      assert.equal(payload.details.nodeEnv, 'production');
    });
  }
});

test('破坏性命令在 help --json 里带 destructive 标记', () => {
  const { payload } = baziJson(['help', 'env', 'init']);
  assert.equal(
    payload.data.tree.destructive,
    true,
    'Agent 只能靠这个标记提前知道哪些命令需要人拍板'
  );
});

test('非破坏性路径不该被闸拦住', () => {
  // .env 已存在时不带 --force 的 init 什么都不改，属于查询级操作，不能要 --yes。
  const { code, payload } = baziJson(['env', 'init', '--dry-run'], { env: dev });
  assert.equal(code, 0);
  assert.equal(payload.ok, true);
});

test('测试进程不继承 .env（避免"本机能过、CI 过不了"）', () => {
  const { payload } = baziJson(['test', 'backend', '--dry-run'], { env: dev });
  assert.equal(payload.ok, true);
  assert.equal(payload.data.results[0].status, 'dry-run');
});

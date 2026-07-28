import assert from 'node:assert/strict';
import test from 'node:test';

import { baziJson, REMOTE_DB_URL } from './helpers.mjs';

/**
 * 安全闸回归网。
 *
 * assertDestructiveAllowed 是整个 CLI 里唯一"拦得住 Agent"的东西，
 * 而它的三道闸有先后顺序、有互相影响，改一行就可能悄悄失效。
 *
 * 这里所有用例都不会真的动数据库：
 *   - 命中闸的用例在执行之前就抛了
 *   - 放行的用例一律带 --dry-run，dry-run 分支在任何子进程调用之前 return
 */

/** 指向本机、格式合法的库地址：用来越过"非本地库"那道闸，不代表这个库真的存在 */
const LOCAL_DB_URL = 'postgresql://u:p@127.0.0.1:5432/whatever';
const local = { DATABASE_URL: LOCAL_DB_URL, NODE_ENV: 'development' };

test('没有 --yes 时破坏性命令一律退 7', async (t) => {
  for (const args of [
    ['db', 'reset'],
    ['db', 'restore', 'package.json'],
  ]) {
    await t.test(`bazi ${args.join(' ')}`, () => {
      const { code, payload } = baziJson(args, { env: local });
      assert.equal(code, 7);
      assert.equal(payload.code, 'blocked');
      assert.match(payload.error, /破坏性操作/);
    });
  }
});

test('exit 7 给出的下一步必须是 Agent 真能安全执行的', () => {
  // 这条曾经写着"只想看会做什么就加 --dry-run"，但当时 --dry-run 也会被同一道闸拦住，
  // 照着做会拿到一模一样的 7 —— 一个死循环。
  const { payload } = baziJson(['db', 'reset'], { env: local });
  assert.match(payload.next, /--dry-run/);
  assert.equal(payload.details.dryRunAvailable, true);

  const preview = baziJson(['db', 'reset', '--dry-run'], { env: local });
  assert.equal(preview.code, 0, 'next 建议的 --dry-run 必须真的能跑通');
  assert.equal(preview.payload.ok, true);
  assert.equal(preview.payload.data.dryRun, true);
});

test('--dry-run 只能越过确认闸，越不过另外两道', async (t) => {
  await t.test('NODE_ENV=production 下 --dry-run 照样退 7', () => {
    const { code, payload } = baziJson(['db', 'reset', '--dry-run'], {
      env: { ...local, NODE_ENV: 'production' },
    });
    assert.equal(code, 7);
    assert.match(payload.error, /production/);
  });

  await t.test('非本地库 --dry-run 照样退 7', () => {
    const { code, payload } = baziJson(['db', 'reset', '--dry-run'], {
      env: { ...local, DATABASE_URL: REMOTE_DB_URL },
    });
    assert.equal(code, 7);
    assert.match(payload.error, /非本地/);
  });
});

test('NODE_ENV=production 下加什么参数都拒绝', async (t) => {
  const combos = [
    ['db', 'reset', '--yes'],
    ['db', 'reset', '--yes', '--allow-remote'],
    ['db', 'reset', '--yes', '--dry-run'],
    ['db', 'restore', 'package.json', '--yes', '--allow-remote'],
  ];
  for (const args of combos) {
    await t.test(`bazi ${args.join(' ')}`, () => {
      const { code, payload } = baziJson(args, { env: { ...local, NODE_ENV: 'production' } });
      assert.equal(code, 7, 'production 是硬边界，任何参数组合都不能放行');
      assert.equal(payload.code, 'blocked');
      assert.equal(payload.details.nodeEnv, 'production');
    });
  }
});

test('非本地库必须显式 --allow-remote', () => {
  const blocked = baziJson(['db', 'reset', '--yes'], { env: { DATABASE_URL: REMOTE_DB_URL } });
  assert.equal(blocked.code, 7);
  assert.match(blocked.payload.next, /--allow-remote/);

  // 给足参数之后应该放行到 dry-run 分支 —— 且不需要连上那个库
  const allowed = baziJson(['db', 'reset', '--yes', '--allow-remote', '--dry-run'], {
    env: { DATABASE_URL: REMOTE_DB_URL },
  });
  assert.equal(allowed.code, 0);
  assert.equal(allowed.payload.data.dryRun, true);
});

test('报错和预览都不能泄露数据库密码', async (t) => {
  const cases = [
    { args: ['db', 'reset'], env: local },
    { args: ['db', 'reset', '--dry-run'], env: local },
    { args: ['db', 'reset', '--yes'], env: { DATABASE_URL: REMOTE_DB_URL } },
  ];
  for (const { args, env } of cases) {
    await t.test(`bazi ${args.join(' ')}`, () => {
      const { stdout, stderr } = baziJson(args, { env });
      assert.equal(/:p@/.test(stdout + stderr), false, '密码不应出现在输出里');
      assert.match(stdout, /\*\*\*/, '库地址应该以脱敏形式出现');
    });
  }
});

test('dry-run 不需要数据库活着', () => {
  // 端口 1 上不可能有 PostgreSQL。dry-run 分支必须在任何连接尝试之前返回，
  // 否则栈没起的时候 Agent 连"会动哪个库"都看不到。
  const { code, payload } = baziJson(['db', 'reset', '--dry-run'], {
    env: { DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/whatever', NODE_ENV: 'development' },
  });
  assert.equal(code, 0);
  assert.equal(payload.data.dryRun, true);
});

test('restore 的文件检查发生在动库之前', () => {
  const { code, payload } = baziJson(['db', 'restore', 'no-such-file.dump', '--yes'], {
    env: local,
  });
  assert.equal(code, 2, '文件不存在是用法错，不是环境问题');
  assert.equal(payload.code, 'usage');
});

test('test 默认不把开发库 URL 传给测试进程', () => {
  // 传进去等于让测试在开发库上跑迁移和重置。这是数据事故级别的默认值，
  // 必须由 --use-dev-db 显式打开。
  const { payload } = baziJson(['test', 'backend', '--dry-run'], { env: local });
  assert.equal(payload.ok, true);

  const warned = baziJson(['test', 'backend', '--dry-run', '--use-dev-db'], { env: local });
  assert.equal(
    warned.payload.notes.some((n) => n.level === 'warn' && /开发库/.test(n.message)),
    true,
    '--use-dev-db 必须在 notes 里留下警告，Agent 才可能复述给人'
  );
});

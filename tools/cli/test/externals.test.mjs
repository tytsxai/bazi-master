import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './helpers.mjs';
import { TARGETS } from '../src/commands/test.mjs';

/**
 * CLI 调用的外部东西必须真的存在。
 *
 * 这一组测试的由来：`stack up` 里有段 ensureWasm，在 wasm 产物缺失时去跑
 * `npm run asbuild`。而那个 script 连同整个 AssemblyScript 链路早就被当死代码
 * 删掉了，删的时候漏了 CLI 这处。结果是 `bazi stack up` 在任何干净环境下都必然
 * 失败 —— 而且退的是 exit 3（环境未就绪）并提示去装依赖，把人往完全错误的方向指。
 *
 * 光测 `help --json` 自洽是发现不了这类问题的：命令树里一切正常，坏的是它运行时
 * 去调的那个东西。
 */

const scriptsIn = (dir) => {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {};
};

const AREA_DIR = {
  root: ROOT,
  frontend: path.join(ROOT, 'frontend'),
  backend: path.join(ROOT, 'backend'),
};

test('bazi test 的每个目标都对应一个真实存在的 npm script', () => {
  for (const [name, target] of Object.entries(TARGETS)) {
    assert.equal(typeof target.script, 'string', `${name} 没写 script，跳过检查就失去意义了`);

    const cwd = target.cwd();
    const scripts = scriptsIn(cwd);
    assert.notEqual(scripts, null, `${name} 的 cwd ${cwd} 下没有 package.json`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(scripts, target.script),
      true,
      `bazi test ${name} 要跑 "npm run ${target.script}"，但 ${path.relative(ROOT, cwd) || '.'}/package.json 里没有这个 script`
    );
  }
});

test('bazi test 的 args 和它声明的 script 是同一个', () => {
  // 两者不一致时，blockedReason 会去检查 A 而实际跑的是 B ——
  // "script 存在性检查"就变成了摆设。
  for (const [name, target] of Object.entries(TARGETS)) {
    const args = target.args;
    const scriptFromArgs = args[0] === 'run' ? args[1] : args[0];
    assert.equal(
      scriptFromArgs,
      target.script,
      `${name} 声明 script="${target.script}"，实际跑的却是 "npm ${args.join(' ')}"`
    );
  }
});

const listSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return entry.name.endsWith('.mjs') ? [full] : [];
  });

test('源码里硬编码的 npm run 都指向真实存在的 script', () => {
  // 这条守的是 asbuild 那种写法：绕开 TARGETS，直接在某个命令里写死一个 script 名。
  // 当前应当扫不到任何一处（都走 TARGETS），但留着它，下次有人写死时会当场被拦下。
  const hardcoded = [];
  for (const file of listSources(path.join(ROOT, 'tools/cli/src'))) {
    const text = fs.readFileSync(file, 'utf8');
    const pattern = /run\(\s*'npm'\s*,\s*\[\s*'run'\s*,\s*'([^']+)'\s*\]/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const area = text.slice(match.index, match.index + 400).match(/cwd:\s*paths\.(\w+)/);
      hardcoded.push({ file, script: match[1], area: area ? area[1] : 'root' });
    }
  }

  for (const item of hardcoded) {
    const dir = AREA_DIR[item.area];
    assert.notEqual(dir, undefined, `${item.file} 用了未知的 paths.${item.area}`);
    const scripts = scriptsIn(dir);
    assert.equal(
      scripts !== null && Object.prototype.hasOwnProperty.call(scripts, item.script),
      true,
      `${path.relative(ROOT, item.file)} 会跑 "npm run ${item.script}"（cwd=paths.${item.area}），但那个 script 不存在`
    );
  }
});

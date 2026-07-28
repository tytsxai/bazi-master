import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BIN = path.join(ROOT, 'tools/cli/bin/bazi.mjs');

/**
 * 用子进程跑 CLI —— 这是唯一能真正验证契约的方式。
 *
 * 直接 import main() 测不出退出码，也测不出"有没有东西偷偷写进 stdout"，
 * 而这两件事恰好是 Agent 唯一依赖的东西。
 */
export const bazi = (args, { env = {}, timeout = 60_000 } = {}) => {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
  if (result.error) throw result.error;
  return {
    args,
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

/**
 * 跑一条 --json 命令，并断言 stdout 恰好是一个 JSON 文档。
 *
 * JSON.parse 对尾随内容会直接抛错，所以"能 parse"本身就等价于
 * "stdout 里没有第二个文档、没有进度行、没有子进程噪音"。
 */
export const baziJson = (args, options) => {
  const result = bazi([...args, '--json'], options);
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `\`bazi ${args.join(' ')} --json\` 的 stdout 不是单个 JSON 文档：${error.message}\n` +
        `--- stdout ---\n${result.stdout.slice(0, 2000)}\n--- stderr ---\n${result.stderr.slice(0, 1000)}`
    );
  }
  return { ...result, payload };
};

/** 遍历 help --json 的命令树 */
export const walkTree = (node, visit, depth = 0) => {
  visit(node, depth);
  for (const child of node.commands || []) walkTree(child, visit, depth + 1);
};

/** 一个必定不在本机、也必定不是 localhost 的库地址，用来触发"非本地库"这道闸 */
export const REMOTE_DB_URL = 'postgresql://u:p@db.invalid.example:5432/whatever';

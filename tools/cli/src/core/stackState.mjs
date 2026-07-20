import fs from 'node:fs';
import path from 'node:path';

import { ensureStateDirs, paths, readJsonFile, writeJsonFile } from './context.mjs';
import { isAlive } from './proc.mjs';

const pidFile = (name) => path.join(paths.state, `${name}.json`);
export const logFile = (name) => path.join(paths.logs, `${name}.log`);

export const writeRecord = (name, record) => {
  ensureStateDirs();
  writeJsonFile(pidFile(name), { name, ...record });
};

export const readRecord = (name) => {
  const record = readJsonFile(pidFile(name));
  if (!record) return null;
  // pidfile 是不可信的：进程可能已经死了、也可能 pid 被系统复用了。
  // 只把"活着"这一条当事实，其余字段仅作参考。
  return { ...record, alive: isAlive(record.pid) };
};

export const clearRecord = (name) => {
  try {
    fs.unlinkSync(pidFile(name));
  } catch {
    /* 不存在就当已清理 */
  }
};

export const appendLog = (name, message) => {
  ensureStateDirs();
  fs.appendFileSync(logFile(name), `[bazi-cli ${new Date().toISOString()}] ${message}\n`);
};

export const tailLog = (name, lines = 40) => {
  const file = logFile(name);
  if (!fs.existsSync(file)) return '';
  const content = fs.readFileSync(file, 'utf8').split('\n');
  return content.slice(-lines).join('\n');
};

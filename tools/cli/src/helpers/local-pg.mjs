/**
 * 本地 PostgreSQL 的隔离壳子。
 *
 * 为什么要多一层进程：backend/scripts/local-postgres.mjs 里的 initdb / pg_ctl 是
 * stdio:'inherit' 的，直接 import 会把它们的输出灌进 CLI 的 stdout，破坏
 * `--json` 只输出一个 JSON 文档的契约。所以这里单独起一个进程承接那些噪音，
 * 结果只通过 resultFile 回传。逻辑仍然复用项目已有实现，不重写。
 *
 * 用法：node local-pg.mjs <start|stop> <resultFile>
 * 配置走 BAZI_HELPER_PG_* 环境变量。
 */
import fs from 'node:fs';

import { ensureLocalPostgres, stopLocalPostgres } from '../../../../backend/scripts/local-postgres.mjs';

const [action, resultFile] = process.argv.slice(2);

const config = {
  dataDir: process.env.BAZI_HELPER_PG_DATADIR,
  host: process.env.BAZI_HELPER_PG_HOST || '127.0.0.1',
  port: Number(process.env.BAZI_HELPER_PG_PORT || 5433),
  dbName: process.env.BAZI_HELPER_PG_DB || 'bazi_master',
  logFile: process.env.BAZI_HELPER_PG_LOG || undefined,
};

const finish = (payload, code) => {
  if (resultFile) fs.writeFileSync(resultFile, `${JSON.stringify(payload)}\n`);
  process.exit(code);
};

try {
  if (action === 'start') {
    const result = await ensureLocalPostgres(config);
    finish({ ok: true, ...result }, 0);
  } else if (action === 'stop') {
    stopLocalPostgres({ dataDir: config.dataDir });
    finish({ ok: true }, 0);
  } else {
    finish({ ok: false, error: `未知 action: ${action}` }, 2);
  }
} catch (error) {
  finish({ ok: false, error: error?.message || String(error) }, 1);
}

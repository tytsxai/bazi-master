/**
 * E2E 专属 PostgreSQL 的配置与回收。
 *
 * 谁负责停这个库，是有讲究的：dev-server 收到 SIGTERM 后同步跑 pg_ctl stop 看着很自然，
 * 但那个 pg_ctl 是 dev-server 的子进程、同一个进程组，而 Playwright 关 webServer 时是对
 * 整个进程组先 SIGTERM 再 SIGKILL——pg_ctl 常常在等 postmaster 退出的半路上就被一起杀了，
 * postmaster 反而活下来。所以真正可靠的回收点在 run-playwright.mjs：它是整轮测试的父进程，
 * 等 Playwright 完全退出之后才动手，没有这个竞态。dev-server 里的那次 stop 保留作 best-effort。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopLocalPostgres } from '../../backend/scripts/local-postgres.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

/**
 * 端口默认 5434 而不是 5433：5433 是 `bazi stack` 开发库的端口。共用端口时
 * ensureLocalPostgres 会发现端口已占用就直接复用开发库那个实例，于是 e2e 到底跑在自己的
 * 集群上还是开发库上，取决于当时开发栈开没开——这不是设计，是巧合。给 e2e 自己的端口，
 * 两种状态下行为一致，"测试用隔离库" 的约定才真的成立。
 */
export const e2ePostgresDataDir = path.join(rootDir, 'prisma', '.pgdata-e2e');
export const e2ePostgresPort = Number(process.env.PG_E2E_PORT || 5434);
export const e2ePostgresDbName = process.env.PG_E2E_DB || 'bazi_master_e2e';

/**
 * 只回收我们自己起的那个集群。给了 E2E_DATABASE_URL 就说明库是外面提供的，
 * 停别人的库是越权。
 */
export const stopE2EPostgres = () => {
  if (process.env.E2E_DATABASE_URL) return;
  // immediate 而不是 fast：测试库不在乎干净关闭，少等一次 checkpoint。
  stopLocalPostgres({ dataDir: e2ePostgresDataDir, mode: 'immediate' });
};

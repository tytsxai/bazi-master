import { run } from './proc.mjs';
import { paths } from './context.mjs';

/** 所有 Prisma 调用都走项目自己的 scripts/prisma.mjs，schema 路径由 CLI 统一给死。 */
export const runPrisma = (args, { env, stdio = ['ignore', 'pipe', 'pipe'] } = {}) =>
  run(process.execPath, ['scripts/prisma.mjs', ...args, `--schema=${paths.prismaSchema}`], {
    cwd: paths.backend,
    env,
    stdio,
  });

/**
 * 迁移状态：up-to-date / pending / no-schema / unreachable / unknown。
 *
 * Prisma 在"有待应用迁移"时也返回非 0，所以不能只看退出码，必须读输出。
 */
export const migrationState = async (env) => {
  const result = await runPrisma(['migrate', 'status'], { env });
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (/up to date|已是最新/i.test(text)) return { state: 'up-to-date', text };
  if (/have not yet been applied|not yet been applied|pending/i.test(text)) {
    return { state: 'pending', text };
  }
  if (/No migration found|没有找到迁移/i.test(text)) return { state: 'no-schema', text };
  if (/P1001|Can't reach database|无法连接/i.test(text)) return { state: 'unreachable', text };
  return { state: 'unknown', text };
};

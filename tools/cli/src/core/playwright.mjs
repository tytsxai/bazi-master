import fs from 'node:fs';
import path from 'node:path';

import { capture, run } from './proc.mjs';
import { fileExists, paths } from './context.mjs';

/**
 * Playwright 浏览器的"装没装"只能问 Playwright 自己。
 *
 * 不要去猜 ms-playwright 缓存目录下的命名：别的项目留下的旧版本（chromium-1193 之类）
 * 会让前缀匹配误判成已就绪，而本项目需要的版本——尤其是 headless 跑 e2e 实际用的
 * chromium_headless_shell-<rev>——其实是缺的。"体检全绿、一跑 e2e 全红"比没有检查更浪费时间。
 *
 * `install --dry-run` 只打印计划、不下载，所以拿它当探针是安全且幂等的。
 */
const PLAYWRIGHT_CLI = path.join(paths.frontend, 'node_modules', 'playwright', 'cli.js');
export const PLAYWRIGHT_INSTALL_HINT = 'npm --prefix frontend exec -- playwright install chromium';

const dirHasContent = (target) => {
  try {
    return fs.statSync(target).isDirectory() && fs.readdirSync(target).length > 0;
  } catch {
    return false;
  }
};

/**
 * @returns {{state: 'ready'|'missing'|'unknown'|'no-deps', detail: string, missing: string[]}}
 *   state 而不是 doctor 的 status —— 调用方自己决定这算 ok / warn / skip 还是该触发安装。
 */
export const probePlaywrightBrowsers = () => {
  if (!fileExists(path.join(paths.frontend, 'node_modules')) || !fileExists(PLAYWRIGHT_CLI)) {
    return { state: 'no-deps', detail: '前端依赖未安装，无法确认浏览器状态', missing: [] };
  }

  const probe = capture(process.execPath, [PLAYWRIGHT_CLI, 'install', '--dry-run', 'chromium']);
  if (probe.code !== 0) {
    const reason = (probe.stderr || probe.stdout || '未知错误').split('\n')[0];
    return { state: 'unknown', detail: `无法确认浏览器状态：${reason}`, missing: [] };
  }

  const locations = [
    ...new Set(
      [...probe.stdout.matchAll(/^\s*Install location:\s*(.+)$/gm)].map((m) => m[1].trim())
    ),
  ];
  if (!locations.length) {
    return {
      state: 'unknown',
      detail: '解析 playwright install --dry-run 输出失败，无法确认浏览器状态',
      missing: [],
    };
  }

  const missing = locations.filter((dir) => !dirHasContent(dir));
  const names = (list) => list.map((d) => path.basename(d)).join('、');
  return missing.length
    ? { state: 'missing', detail: `缺少 ${names(missing)}，e2e 无法运行`, missing }
    : { state: 'ready', detail: `${names(locations)} 已就绪`, missing: [] };
};

export const installPlaywrightBrowsers = (opts = {}) =>
  run(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], { cwd: paths.frontend, ...opts });

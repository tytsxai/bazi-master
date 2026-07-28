import fs from 'node:fs/promises';
import path from 'node:path';

// 巡检脚本的证据截图统一走这里。
//
// 以前 18 个 verify-*.mjs 各自复制同一段 outDir/stamp/screenshot 逻辑，全部按
// 无损 PNG + fullPage 落盘，单张 3~6MB、一轮巡检几十兆，而且从不清理。这些文件
// 被误提交进 git 后历史体积涨到 800MB+，clone 一次要拉 735MB。
//
// 现在：统一实现一份，落 JPEG 而不是无损 PNG，并按轮次自动清理旧证据。
//
// 关于体积，别指望换格式能解决根本问题：这些图之所以大，主因是 fullPage 把长页面
// 拉成了超高的图——历史上最大的一张是 1280x24474 像素。拿真实历史截图实测，同尺寸
// 转 JPEG q70 只降 35%~48%（5.92MB -> 3.86MB）。真正把本地磁盘占用兜住的是下面的
// 按轮清理；真正防止仓库再被撑爆的是 .gitignore + CI 的 scripts/check-repo-artifacts.sh。
// 需要更小可以调 BAZI_EVIDENCE_QUALITY（q60 约再降 17%，仍然完全能看清）。

const DEFAULT_DIR = 'verification';
const DEFAULT_QUALITY = 70;
const DEFAULT_KEEP = 5;

// 证据文件名形如 `2026-07-28T10-15-30-123Z-iching-step-1-home.jpg`，
// 前缀就是这一轮巡检的 stamp。清理时只认这个格式，绝不碰目录里的其它文件。
const EVIDENCE_FILE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-.+\.(?:jpe?g|png)$/;

function intFromEnv(raw, fallback) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function evidenceDir() {
  return path.resolve(process.cwd(), process.env.BAZI_EVIDENCE_DIR || DEFAULT_DIR);
}

/**
 * 按轮次保留最近 `keep` 轮证据（含调用方即将写入的这一轮），删掉更早的。
 * `BAZI_EVIDENCE_KEEP=0` 关闭清理。返回被删掉的文件名，方便调用方打日志。
 */
export async function pruneEvidence(
  dir,
  keep = intFromEnv(process.env.BAZI_EVIDENCE_KEEP, DEFAULT_KEEP)
) {
  if (keep === 0) return [];

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const rounds = new Map();
  for (const name of entries) {
    const matched = EVIDENCE_FILE.exec(name);
    if (!matched) continue;
    const files = rounds.get(matched[1]) ?? [];
    files.push(name);
    rounds.set(matched[1], files);
  }

  // stamp 是 ISO 串，字典序即时间序。给马上要写的这一轮留一个位置。
  const stale = [...rounds.keys()].sort().slice(0, Math.max(0, rounds.size - (keep - 1)));
  const removed = [];
  for (const stamp of stale) {
    for (const name of rounds.get(stamp)) {
      await fs.rm(path.join(dir, name), { force: true });
      removed.push(name);
    }
  }
  return removed;
}

/**
 * 准备好证据目录并返回这一轮的 shot()。调用方自己拿着 page：
 *
 *   const evidence = await createEvidence();
 *   await evidence.shot(page, 'step-1-home');
 *
 * 默认整页截图；传 `{ fullPage: false }` 只截当前视口。
 */
export async function createEvidence() {
  const dir = evidenceDir();
  await fs.mkdir(dir, { recursive: true });
  await pruneEvidence(dir);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quality = intFromEnv(process.env.BAZI_EVIDENCE_QUALITY, DEFAULT_QUALITY);

  const shot = async (page, name, options = {}) => {
    const file = path.join(dir, `${stamp}-${name}.jpg`);
    await page.screenshot({ type: 'jpeg', quality, fullPage: true, ...options, path: file });
    return file;
  };

  return { dir, stamp, shot };
}

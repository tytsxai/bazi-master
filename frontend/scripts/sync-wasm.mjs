import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const buildWasmPath = path.join(frontendDir, 'build', 'optimized.wasm');
const publicWasmDir = path.join(frontendDir, 'public', 'wasm');
const publicWasmPath = path.join(publicWasmDir, 'optimized.wasm');

const readFileSafe = async (filePath) => {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
};

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const sameBuffer = (a, b) => {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.equals(b);
};

const run = async () => {
  const source = await readFileSafe(buildWasmPath);
  if (!source) {
    throw new Error(`[sync-wasm] Missing build output: ${buildWasmPath}`);
  }

  await ensureDir(publicWasmDir);
  const target = await readFileSafe(publicWasmPath);
  if (target && sameBuffer(source, target)) {
    console.log('[sync-wasm] public/wasm/optimized.wasm is up to date');
    return;
  }

  await fs.writeFile(publicWasmPath, source);
  console.log('[sync-wasm] Copied build/optimized.wasm -> public/wasm/optimized.wasm');
};

run().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});

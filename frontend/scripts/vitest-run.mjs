import { parseCLI, startVitest } from 'vitest/node';

const realExit = process.exit.bind(process);

const argv = process.argv.slice(2);
const hasCoverageFlag = argv.some((arg) => arg === '--coverage' || arg.startsWith('--coverage'));

const defaultHardExitMs = hasCoverageFlag ? '180000' : '30000';
const hardExitAfterMs = Number.parseInt(process.env.VITEST_HARD_EXIT_MS ?? defaultHardExitMs, 10);
const hardExitTimer = setTimeout(() => {
  realExit(process.exitCode ?? 0);
}, Number.isFinite(hardExitAfterMs) ? hardExitAfterMs : 30000);
hardExitTimer.unref?.();

const { filter, options } = parseCLI(['vitest', 'run', ...argv]);

await startVitest('test', filter, options);

clearTimeout(hardExitTimer);
realExit(process.exitCode ?? 0);

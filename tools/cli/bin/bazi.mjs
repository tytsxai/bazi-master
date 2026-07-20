#!/usr/bin/env node
import { main } from '../src/main.mjs';

// stdout 被下游关掉（比如 `bazi help | head`）时不要炸出堆栈。
process.stdout.on('error', (error) => {
  if (error?.code === 'EPIPE') process.exit(0);
  throw error;
});

process.exitCode = await main(process.argv.slice(2));

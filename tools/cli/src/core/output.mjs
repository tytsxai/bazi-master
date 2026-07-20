import { EXIT, EXIT_MEANING } from './errors.mjs';

const COLOR = {
  reset: '[0m',
  dim: '[2m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
};

const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (color, text) => (useColor() ? `${COLOR[color]}${text}${COLOR.reset}` : text);

/**
 * 输出层的硬约束：--json 模式下 stdout 只能有一个 JSON 文档。
 * 所有进度、警告、子进程噪音一律走 stderr，否则 Agent 解析 stdout 会炸。
 */
export const createOutput = ({ json = false, quiet = false, command = '' } = {}) => {
  const notes = [];

  const narrate = (text) => {
    if (quiet) return;
    process.stderr.write(`${text}\n`);
  };

  return {
    json,
    quiet,
    /** 子进程应该继承哪种 stdio —— json 模式下不能让子进程写 stdout */
    childStdio: json ? ['ignore', 'pipe', 'pipe'] : 'inherit',

    step(text) {
      narrate(`${paint('cyan', '→')} ${text}`);
    },
    info(text) {
      narrate(`  ${text}`);
    },
    warn(text) {
      notes.push({ level: 'warn', message: text });
      narrate(`${paint('yellow', '!')} ${text}`);
    },
    detail(text) {
      if (json) return;
      narrate(paint('dim', `  ${text}`));
    },

    /**
     * 只在文本模式打印结果表，不收尾。
     * 用于"结果要给人看，但命令最终以失败退出"的场景（比如 doctor 有 fail 项）——
     * json 模式下必须跳过，否则 stdout 会出现两个 JSON 文档，破坏解析契约。
     */
    render(data, renderText) {
      if (json || typeof renderText !== 'function') return;
      const text = renderText(data);
      if (text) process.stdout.write(`${text}\n`);
    },

    /** 成功收尾。renderText 只在非 json 模式调用，用来打人类可读结果。 */
    ok(data = {}, renderText) {
      if (json) {
        process.stdout.write(`${JSON.stringify({ ok: true, command, data, notes }, null, 2)}\n`);
      } else if (typeof renderText === 'function') {
        const text = renderText(data);
        if (text) process.stdout.write(`${text}\n`);
      }
      return EXIT.OK;
    },

    /** 失败收尾。人类模式下必须把 hint / next 打出来，Agent 只会读这两行。 */
    fail(error) {
      const exit = error?.exit ?? EXIT.FAILED;
      const payload = {
        ok: false,
        command,
        code: error?.code || 'error',
        exit,
        exitMeaning: EXIT_MEANING[exit] || 'unknown',
        error: error?.message || String(error),
        hint: error?.hint || null,
        next: error?.next || null,
        details: error?.details ?? null,
        notes,
      };
      if (json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stderr.write(`${paint('red', 'error:')} ${payload.error}\n`);
        if (payload.hint) process.stderr.write(`${paint('yellow', 'hint: ')} ${payload.hint}\n`);
        if (payload.next) process.stderr.write(`${paint('cyan', 'next: ')} ${payload.next}\n`);
        if (!json && process.env.BAZI_CLI_TRACE && error?.stack) {
          process.stderr.write(`${paint('dim', error.stack)}\n`);
        }
      }
      return exit;
    },

    statusIcon(status) {
      if (status === 'ok') return paint('green', '✓');
      if (status === 'warn') return paint('yellow', '!');
      if (status === 'skip') return paint('dim', '-');
      return paint('red', '✗');
    },
    paint,
  };
};

/**
 * 退出码分类 —— 这是 CLI 与 Agent 之间最重要的契约。
 *
 * Agent 拿到退出码就应该知道下一步该做什么，而不需要读懂人类可读的错误文本：
 *   ENV       -> 去修环境（装依赖 / 建 .env / 起数据库），修完可以原样重试
 *   RETRYABLE -> 什么都不用改，等一下重试即可
 *   BLOCKED   -> 命中安全边界，必须由人决策，不要自行绕过
 *   USAGE     -> 命令写错了，去读 --help
 *   REMOTE    -> 远端明确拒绝了，改请求内容而不是改环境
 *   FAILED    -> 命令跑通了但结果是失败（测试挂了、校验没过），去看结果本身
 */
export const EXIT = {
  OK: 0,
  FAILED: 1,
  USAGE: 2,
  ENV: 3,
  REMOTE: 4,
  RETRYABLE: 5,
  BLOCKED: 7,
};

export const EXIT_MEANING = {
  0: 'ok — 成功',
  1: 'failed — 命令执行了，但结果是失败（看结果本身）',
  2: 'usage — 用法错误（读 --help）',
  3: 'env — 环境未就绪（跑 bazi doctor --fix）',
  4: 'remote — 远端/服务拒绝（改请求，不是改环境）',
  5: 'retryable — 瞬时失败（原样重试）',
  7: 'blocked — 命中安全边界（需要人决策，不要绕过）',
};

/**
 * 所有可预期的失败都应该抛 CliError，而不是裸 Error。
 * hint 说明为什么失败，next 给出一条可以直接复制执行的命令。
 */
export class CliError extends Error {
  constructor(message, { exit = EXIT.FAILED, code = 'error', hint, next, details } = {}) {
    super(message);
    this.name = 'CliError';
    this.exit = exit;
    this.code = code;
    this.hint = hint;
    this.next = next;
    this.details = details;
  }
}

export const usageError = (message, { next, details } = {}) =>
  new CliError(message, { exit: EXIT.USAGE, code: 'usage', next, details });

export const envError = (message, { hint, next, details } = {}) =>
  new CliError(message, { exit: EXIT.ENV, code: 'env_not_ready', hint, next, details });

export const remoteError = (message, { hint, next, details } = {}) =>
  new CliError(message, { exit: EXIT.REMOTE, code: 'remote_rejected', hint, next, details });

export const retryableError = (message, { hint, next, details } = {}) =>
  new CliError(message, { exit: EXIT.RETRYABLE, code: 'retryable', hint, next, details });

export const blockedError = (message, { hint, next, details } = {}) =>
  new CliError(message, { exit: EXIT.BLOCKED, code: 'blocked', hint, next, details });

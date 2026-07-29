import { buildEnv } from './context.mjs';
import { CliError, EXIT, envError, remoteError, retryableError, usageError } from './errors.mjs';

/**
 * 能力命令的薄客户端。
 *
 * 算法引擎是常驻进程（`bazi stack up` 起的那个），对外只有 HTTP 一个接口面。
 * 这一层不实现任何算法，只做两件事：
 *   1. 把命令行参数翻译成请求
 *   2. **把 HTTP 语义翻译成退出码契约**
 *
 * 第二件才是它存在的理由。Agent 不该去理解 400 和 503 的区别 ——
 * 它只需要知道"改请求"还是"修环境"，而那正是 exit 4 与 exit 3 的分工。
 * 如果调用方还得读 HTTP 状态码才知道下一步，这层就白加了。
 */

export const DEFAULT_TIMEOUT_MS = 15000;

/**
 * 引擎地址。BAZI_API_URL 优先，方便把 CLI 指向远端实例（容器、同事的机器、staging）。
 * 都没配就是本地栈的默认端口 —— 和 stack.mjs 的 apiPort 保持同一套约定。
 */
export const apiBaseUrl = (env = buildEnv()) => {
  const explicit = env.BAZI_API_URL || env.BACKEND_BASE_URL;
  if (explicit) return String(explicit).replace(/\/+$/, '');
  return `http://127.0.0.1:${Number(env.PORT || 4000)}`;
};

/** 响应体里找一条人能看懂的原因，找不到就退回状态码。 */
const reasonOf = (body, response) =>
  body?.error || body?.message || `HTTP ${response.status} ${response.statusText || ''}`.trim();

/**
 * 状态码 -> 退出码。这张表就是契约本身，改它等于改 Agent 的行为。
 */
const mapHttpFailure = ({ response, body, base, method, path }) => {
  const status = response.status;
  const reason = reasonOf(body, response);
  const details = { status, method, path, url: `${base}${path}`, body: body ?? null };

  // 服务活着但没准备好（依赖未就绪、正在优雅关闭）。属于环境问题，修完原样重试即可。
  if (status === 503) {
    return envError(`算法服务未就绪：${reason}`, {
      hint: '引擎进程在跑，但 /health 判定为 degraded 或正在关闭。',
      next: 'bazi stack status --json',
      details,
    });
  }

  if (status === 429) {
    return retryableError(`被限流：${reason}`, {
      hint: '触发了服务端限流或同一客户端的 AI 并发闸。',
      next: '等几秒原样重试即可，不需要改参数。',
      details,
    });
  }

  // 4xx：引擎明确拒绝了这个请求。改请求内容，不是改环境 —— 这正是 exit 4 的语义。
  if (status === 400 || status === 422) {
    return remoteError(`引擎拒绝了这个请求：${reason}`, {
      hint: '参数没通过服务端校验。',
      next: '核对出生时间、性别等入参后重试。',
      details,
    });
  }

  // 端点不存在通常意味着 CLI 比引擎新（或反过来），不是用户参数写错了。
  // 单独给一条信息，否则会被误读成"命令写错了"而去反复改参数。
  if (status === 404) {
    return new CliError(`引擎上没有这个端点：${path}`, {
      exit: EXIT.FAILED,
      code: 'endpoint_missing',
      hint: 'CLI 与引擎版本可能不一致，或该能力已下线。',
      next: 'bazi stack restart --only api',
      details,
    });
  }

  if (status >= 500) {
    return new CliError(`引擎内部错误：${reason}`, {
      exit: EXIT.FAILED,
      code: 'engine_error',
      hint: '请求本身是合法的，失败发生在引擎内部。',
      next: 'bazi stack logs api --tail 60',
      details,
    });
  }

  return new CliError(`请求失败：${reason}`, {
    exit: EXIT.FAILED,
    code: 'request_failed',
    details,
  });
};

/**
 * 发一个请求。失败一律抛 CliError —— 调用方不需要自己判断 response.ok。
 */
export const callApi = async (
  path,
  { method = 'GET', body, env = buildEnv(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) => {
  const base = apiBaseUrl(env);
  const url = `${base}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      // connection: close 不是性能取舍，是正确性要求。
      // bin/bazi.mjs 靠自然退出（不调 process.exit，否则可能截断还没 flush 的 stdout），
      // 而 Node 的 fetch 默认把连接留在 keep-alive 池里 —— 那是个活跃 handle，
      // event loop 不空，进程要多挂几秒才退。对一次性的 CLI 调用来说，
      // 复用连接没有任何收益，却让每条能力命令都凭空多等一截。
      headers: {
        connection: 'close',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // 超时和连不上要分开：前者原样重试有意义，后者得先把引擎拉起来。
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw retryableError(`请求超时（${timeoutMs}ms）：${url}`, {
        hint: 'AI 类端点会调用上游模型，比纯计算慢得多。',
        next: `加 --timeout 提高上限后重试`,
        details: { method, path, url, timeoutMs },
      });
    }
    throw envError(`连不上算法引擎 ${base}`, {
      hint: '引擎是常驻进程，CLI 只是它的客户端 —— 进程没起来就什么都算不了。',
      next: 'bazi stack up --only api',
      details: { method, path, url, cause: error?.message || String(error) },
    });
  }

  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    throw mapHttpFailure({ response, body: parsed, base, method, path });
  }

  if (parsed === null && raw) {
    throw new CliError('引擎返回了非 JSON 响应', {
      exit: EXIT.FAILED,
      code: 'bad_response',
      hint: '能力端点约定返回 JSON，收到的却不是。',
      next: 'bazi stack logs api --tail 60',
      details: { method, path, sample: raw.slice(0, 200) },
    });
  }

  return parsed ?? {};
};

// ------------------------------------------------------------------ 入参解析

const pad = (n) => String(n).padStart(2, '0');

/**
 * `--birth 1990-05-20T14:30` -> 拆成引擎要的 birthYear/Month/Day/Hour/Minute。
 *
 * 时辰是必填的，不接受只给日期：八字的时柱、紫微的命宫都由出生时刻决定，
 * 缺了它算出来的不是"精度低一点的盘"，而是另一张盘。与其默认补 00:00
 * 悄悄给出一个错的结果，不如在这里拒绝。
 */
export const parseBirth = (raw, { flag = '--birth' } = {}) => {
  const value = String(raw ?? '').trim();
  const matched = value.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!matched) {
    throw usageError(`${flag} 格式不对："${value}"`, {
      next: `用 YYYY-MM-DDTHH:mm，例如 ${flag} 1990-05-20T14:30`,
      details: { received: value, expected: 'YYYY-MM-DDTHH:mm' },
    });
  }

  const [, y, mo, d, h, mi] = matched;
  const birth = {
    birthYear: Number(y),
    birthMonth: Number(mo),
    birthDay: Number(d),
    birthHour: Number(h),
    birthMinute: Number(mi),
  };

  // 日历合法性交给引擎的 validateBaziInput 做最终判定，这里只拦明显越界的，
  // 好让"2月30号"这类错误在本地就报出来，不用往返一次。
  const probe = new Date(
    Date.UTC(
      birth.birthYear,
      birth.birthMonth - 1,
      birth.birthDay,
      birth.birthHour,
      birth.birthMinute
    )
  );
  const roundTrips =
    probe.getUTCFullYear() === birth.birthYear &&
    probe.getUTCMonth() === birth.birthMonth - 1 &&
    probe.getUTCDate() === birth.birthDay &&
    probe.getUTCHours() === birth.birthHour;
  if (!roundTrips) {
    throw usageError(
      `${flag} 不是一个真实存在的时刻：${birth.birthYear}-${pad(birth.birthMonth)}-${pad(birth.birthDay)} ${pad(birth.birthHour)}:${pad(birth.birthMinute)}`,
      { next: `核对日期后重试，例如 ${flag} 1990-05-20T14:30`, details: birth }
    );
  }

  return birth;
};

export const GENDERS = ['male', 'female'];

export const parseGender = (raw, { flag = '--gender' } = {}) => {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!GENDERS.includes(value)) {
    throw usageError(`${flag} 只接受 ${GENDERS.join(' / ')}，收到 "${raw ?? ''}"`, {
      next: `${flag} male`,
      details: { received: raw ?? null, accepted: GENDERS },
    });
  }
  return value;
};

/** 出生信息那几个可选项各处都一样，集中在这里拼，避免每条命令抄一遍。 */
export const buildBirthPayload = (flags, { requireGender = true } = {}) => {
  if (flags.birth === undefined) {
    throw usageError('缺少 --birth', {
      next: 'bazi calc bazi --birth 1990-05-20T14:30 --gender male --json',
    });
  }
  const payload = { ...parseBirth(flags.birth) };

  if (requireGender || flags.gender !== undefined) {
    payload.gender = parseGender(flags.gender);
  }
  if (flags.location !== undefined) payload.birthLocation = flags.location;
  if (flags.timezone !== undefined) payload.timezone = flags.timezone;
  if (flags['tz-offset'] !== undefined) payload.timezoneOffsetMinutes = flags['tz-offset'];

  return payload;
};

/** 出生信息类命令共用的一组 flag 定义。 */
export const BIRTH_FLAGS = [
  {
    name: 'birth',
    type: 'string',
    summary: '出生时刻 YYYY-MM-DDTHH:mm（时辰必填；分钟只影响真太阳时，不进四柱）',
  },
  { name: 'gender', type: 'string', summary: `性别（${GENDERS.join(' / ')}）` },
  {
    name: 'location',
    type: 'string',
    summary: '出生地，如 "Beijing, CN" 或坐标 "30.27,120.15"。只用于算真太阳时校正值，不改排盘时刻',
  },
  {
    name: 'timezone',
    type: 'string',
    summary: 'IANA 时区，如 Asia/Shanghai。缺了它真太阳时不会被算出来（即使给了 --location）',
  },
  { name: 'tz-offset', type: 'number', summary: '时区偏移分钟数，与 --timezone 二选一' },
  {
    name: 'timeout',
    type: 'number',
    summary: `请求超时毫秒数（默认 ${DEFAULT_TIMEOUT_MS}）`,
  },
];

export const resolveTimeout = (flags) =>
  Number.isFinite(flags.timeout) && flags.timeout > 0 ? flags.timeout : DEFAULT_TIMEOUT_MS;

/**
 * --dry-run 的统一出口：把"会发什么请求"原样打出来，不发。
 * 能力命令本身不写任何状态，dry-run 在这里的价值是让 Agent 能先确认
 * 参数被解析成了什么（尤其是 --birth 的拆分结果），再真的调用。
 */
export const describeRequest = ({ method, path, body, env = buildEnv() }) => ({
  wouldRequest: {
    method,
    url: `${apiBaseUrl(env)}${path}`,
    body: body ?? null,
  },
});

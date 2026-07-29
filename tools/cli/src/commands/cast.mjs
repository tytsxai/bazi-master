import { defineCommand } from '../core/registry.mjs';
import { usageError } from '../core/errors.mjs';
import { callApi, describeRequest, resolveTimeout } from '../core/apiClient.mjs';

/**
 * 能力命令：起卦类。
 *
 * 和 calc 分开是因为结果性质不同 —— 这些命令**同样的输入不保证同样的输出**
 * （塔罗抽牌、时间起卦都含随机或时刻因素）。放进 calc 会让调用方误以为
 * 可以拿它做幂等重试或结果比对。
 */

const ICHING_METHODS = ['number', 'time'];

const parseNumbers = (raw) => {
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 3) {
    throw usageError(`--numbers 需要三个数字，收到 ${parts.length} 个`, {
      next: 'bazi cast iching --numbers 7,8,9 --json',
      details: { received: raw },
    });
  }
  const numbers = parts.map((p) => Number(p));
  if (numbers.some((n) => !Number.isFinite(n))) {
    throw usageError(`--numbers 里有不是数字的项："${raw}"`, {
      next: 'bazi cast iching --numbers 7,8,9 --json',
    });
  }
  return numbers;
};

const ichingCommand = defineCommand({
  name: 'iching',
  summary: '易经起卦：本卦、变爻',
  description:
    'method=number 用给定的三个数起卦（同样的数字得同样的卦，可复现）；\n' +
    'method=time 用当前时刻起卦 —— 每次调用结果都不同，不要用它做回归测试。',
  flags: [
    {
      name: 'method',
      type: 'string',
      summary: `起卦方式（${ICHING_METHODS.join(' / ')}），默认 number`,
    },
    {
      name: 'numbers',
      type: 'string',
      summary: '三个数字，逗号分隔，如 7,8,9（method=number 必填）',
    },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    { note: '用数字起卦（可复现）', command: 'bazi cast iching --numbers 7,8,9 --json' },
    { note: '用当前时刻起卦', command: 'bazi cast iching --method time --json' },
  ],
  run: async ({ flags, out }) => {
    const method = flags.method ?? 'number';
    if (!ICHING_METHODS.includes(method)) {
      throw usageError(`--method 只接受 ${ICHING_METHODS.join(' / ')}，收到 "${method}"`, {
        next: 'bazi cast iching --numbers 7,8,9 --json',
      });
    }

    const body = { method };
    if (method === 'number') {
      if (flags.numbers === undefined) {
        throw usageError('method=number 需要 --numbers', {
          hint: '想让引擎按当前时刻起卦就用 --method time。',
          next: 'bazi cast iching --numbers 7,8,9 --json',
        });
      }
      body.numbers = parseNumbers(flags.numbers);
    } else if (flags.numbers !== undefined) {
      out.warn('--method time 会忽略 --numbers（卦象由当前时刻决定）');
    }

    const path = '/api/iching/divine';

    if (flags['dry-run']) {
      const preview = describeRequest({ method: 'POST', path, body });
      return out.ok(
        preview,
        (d) => `会发送 POST ${d.wouldRequest.url}\n${JSON.stringify(body, null, 2)}`
      );
    }

    out.step('向引擎请求起卦');
    const data = await callApi(path, { method: 'POST', body, timeoutMs: resolveTimeout(flags) });
    return out.ok(data, (d) => {
      const name = d.hexagram?.name || d.hexagram?.chineseName || '未知';
      const changing =
        Array.isArray(d.changingLines) && d.changingLines.length
          ? `变爻: ${d.changingLines.join(', ')}`
          : '无变爻';
      return `本卦: ${name}\n${changing}`;
    });
  },
});

const tarotCommand = defineCommand({
  name: 'tarot',
  summary: '塔罗抽牌',
  description: '每次调用都重新随机，同样的参数不会给出同样的牌 —— 不要用它做回归测试。',
  flags: [
    { name: 'spread', type: 'string', summary: '牌阵，如 SingleCard / ThreeCard，默认 SingleCard' },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    { note: '抽一张', command: 'bazi cast tarot --json' },
    { note: '三张牌阵', command: 'bazi cast tarot --spread ThreeCard --json' },
  ],
  run: async ({ flags, out }) => {
    const body = { spreadType: flags.spread ?? 'SingleCard' };
    const path = '/api/tarot/draw';

    if (flags['dry-run']) {
      const preview = describeRequest({ method: 'POST', path, body });
      return out.ok(
        preview,
        (d) => `会发送 POST ${d.wouldRequest.url}\n${JSON.stringify(body, null, 2)}`
      );
    }

    out.step('向引擎请求抽牌');
    const data = await callApi(path, { method: 'POST', body, timeoutMs: resolveTimeout(flags) });
    return out.ok(data, (d) => {
      const cards = d.cards;
      if (!Array.isArray(cards) || !cards.length) return '抽牌完成（结构见 --json）';
      return cards
        .map((c) => `${c.position ?? '-'}. ${c.name}${c.isReversed ? '（逆位）' : '（正位）'}`)
        .join('\n');
    });
  },
});

export const castCommand = defineCommand({
  name: 'cast',
  summary: '算法能力：起卦抽牌（易经 / 塔罗）',
  description:
    '与 calc 的区别是结果不保证可复现：塔罗每次重新随机，时间起卦取决于调用时刻。\n' +
    '跑之前引擎必须在跑（bazi stack up --only api）。',
  commands: [ichingCommand, tarotCommand],
  examples: [{ note: '抽一张塔罗', command: 'bazi cast tarot --json' }],
});

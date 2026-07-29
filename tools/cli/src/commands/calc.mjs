import { defineCommand } from '../core/registry.mjs';
import { usageError } from '../core/errors.mjs';
import {
  BIRTH_FLAGS,
  buildBirthPayload,
  callApi,
  describeRequest,
  parseBirth,
  parseGender,
  resolveTimeout,
} from '../core/apiClient.mjs';

/**
 * 能力命令：确定性推算。
 *
 * 这些命令不实现算法 —— 算法在常驻引擎里，这里只是它的薄客户端。
 * 之所以值得存在，是因为没有它，Agent 想调用这个项目的能力就只能自己拼
 * `curl localhost:4000/api/...`：既绕开了退出码契约，也绕开了"引擎没起来
 * 该怎么办"的处置逻辑，出错时只能拿到一段裸 HTTP 报文。
 */

// ------------------------------------------------------------------ 渲染

const PILLAR_ORDER = [
  ['year', '年柱'],
  ['month', '月柱'],
  ['day', '日柱'],
  ['hour', '时柱'],
];

const renderPillars = (pillars) => {
  if (!pillars) return null;
  const lines = ['四柱:'];
  for (const [key, label] of PILLAR_ORDER) {
    const pillar = pillars[key];
    if (!pillar) continue;
    const chars = [pillar.charStem, pillar.charBranch].filter(Boolean).join('');
    const romanized = [pillar.stem, pillar.branch].filter(Boolean).join(' ');
    const elements = [pillar.elementStem, pillar.elementBranch].filter(Boolean).join('/');
    lines.push(`  ${label}  ${(chars || '--').padEnd(4)}${romanized.padEnd(22)}${elements}`);
  }
  return lines.length > 1 ? lines.join('\n') : null;
};

const renderFiveElements = (fiveElements) => {
  if (!fiveElements || typeof fiveElements !== 'object') return null;
  const entries = Object.entries(fiveElements).filter(([, v]) => typeof v === 'number');
  if (!entries.length) return null;
  return `五行: ${entries.map(([k, v]) => `${k} ${v}`).join('  ')}`;
};

/**
 * 真太阳时的状态必须显式打出来，而且必须说清楚它没进排盘。
 *
 * 引擎里排盘和真太阳时是两条独立路径：performCalculation 拿的是原始钟表时间，
 * 校正值只是附加在响应里的元信息。`applied: true` 的意思是"校正值算出来了"，
 * 不是"这张盘用了校正后的时刻" —— 上面那几柱依然是钟表时间排的。
 *
 * 不写这一句，调用方会理所当然地反过来理解，而这个误解不会以任何形式报错。
 */
const renderSolarTime = (trueSolarTime) => {
  if (!trueSolarTime || !trueSolarTime.applied) {
    return '真太阳时: 未校正（需要同时给 --location 和 --timezone）';
  }
  const place = trueSolarTime.location?.name || '未知地点';
  const minutes = trueSolarTime.correctionMinutes;
  const delta = typeof minutes === 'number' ? `${minutes > 0 ? '+' : ''}${minutes} 分钟` : '未知';
  return `真太阳时: 校正值 ${delta}（${place}）—— 仅供参考，上面的四柱按钟表时间排`;
};

const renderBazi = (data) =>
  [
    renderPillars(data.pillars),
    renderFiveElements(data.fiveElements),
    renderSolarTime(data.trueSolarTime),
  ]
    .filter(Boolean)
    .join('\n');

// ------------------------------------------------------------------ 子命令

const baziCommand = defineCommand({
  name: 'bazi',
  summary: '八字排盘：四柱、五行、十神、大运',
  description:
    '纯计算，不写任何状态。四柱按钟表时间排，且只吃到「小时」这一粒度——分钟不进四柱。\n' +
    '--location 与 --timezone 只用来算真太阳时校正值，校正值不参与排盘（见 bazi-cli skill）。',
  flags: BIRTH_FLAGS,
  examples: [
    { note: '最小调用', command: 'bazi calc bazi --birth 1990-05-20T14:30 --gender male --json' },
    {
      note: '带真太阳时校正',
      command:
        'bazi calc bazi --birth 1990-05-20T14:30 --gender male --location "Beijing, CN" --timezone Asia/Shanghai --json',
    },
    {
      note: '先确认参数被解析成什么',
      command: 'bazi calc bazi --birth 1990-05-20T14:30 --gender male --dry-run --json',
    },
  ],
  run: async ({ flags, out }) => {
    const body = buildBirthPayload(flags);
    const path = '/api/bazi/calculate';

    if (flags['dry-run']) {
      const preview = describeRequest({ method: 'POST', path, body });
      return out.ok(
        preview,
        (d) => `会发送 POST ${d.wouldRequest.url}\n${JSON.stringify(body, null, 2)}`
      );
    }

    out.step('向引擎请求八字排盘');
    const data = await callApi(path, { method: 'POST', body, timeoutMs: resolveTimeout(flags) });
    return out.ok(data, renderBazi);
  },
});

const ziweiCommand = defineCommand({
  name: 'ziwei',
  summary: '紫微斗数排盘：十二宫与星曜分布',
  flags: BIRTH_FLAGS,
  examples: [
    {
      note: '排一张紫微盘',
      command: 'bazi calc ziwei --birth 1990-05-20T14:30 --gender female --json',
    },
  ],
  run: async ({ flags, out }) => {
    const body = buildBirthPayload(flags);
    const path = '/api/ziwei/calculate';

    if (flags['dry-run']) {
      const preview = describeRequest({ method: 'POST', path, body });
      return out.ok(
        preview,
        (d) => `会发送 POST ${d.wouldRequest.url}\n${JSON.stringify(body, null, 2)}`
      );
    }

    out.step('向引擎请求紫微排盘');
    const data = await callApi(path, { method: 'POST', body, timeoutMs: resolveTimeout(flags) });
    return out.ok(data, (d) => {
      const palaces = d.palaces || d.chart?.palaces;
      if (!Array.isArray(palaces)) return '排盘完成（结构见 --json）';
      return `十二宫: ${palaces.length} 宫已排定\n完整结果请用 --json`;
    });
  },
});

/** 合盘要两个人，所以出生信息那组 flag 得各来一份，不能复用 BIRTH_FLAGS。 */
const SYNASTRY_FLAGS = [
  { name: 'a', type: 'string', summary: '甲方出生时刻 YYYY-MM-DDTHH:mm' },
  { name: 'a-gender', type: 'string', summary: '甲方性别（male / female）' },
  { name: 'a-name', type: 'string', summary: '甲方称呼（可选，只用于结果标注）' },
  { name: 'b', type: 'string', summary: '乙方出生时刻 YYYY-MM-DDTHH:mm' },
  { name: 'b-gender', type: 'string', summary: '乙方性别（male / female）' },
  { name: 'b-name', type: 'string', summary: '乙方称呼（可选，只用于结果标注）' },
  { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
];

const synastryCommand = defineCommand({
  name: 'synastry',
  summary: '合盘：两张八字盘的相性分析',
  flags: SYNASTRY_FLAGS,
  examples: [
    {
      note: '两个人的合盘',
      command:
        'bazi calc synastry --a 1990-05-20T14:30 --a-gender male --b 1992-08-01T09:00 --b-gender female --json',
    },
  ],
  run: async ({ flags, out }) => {
    for (const [flag, value] of [
      ['--a', flags.a],
      ['--b', flags.b],
    ]) {
      if (value === undefined) {
        throw usageError(`缺少 ${flag}`, {
          next: 'bazi calc synastry --a 1990-05-20T14:30 --a-gender male --b 1992-08-01T09:00 --b-gender female --json',
        });
      }
    }

    const personA = {
      ...parseBirth(flags.a, { flag: '--a' }),
      gender: parseGender(flags['a-gender'], { flag: '--a-gender' }),
    };
    const personB = {
      ...parseBirth(flags.b, { flag: '--b' }),
      gender: parseGender(flags['b-gender'], { flag: '--b-gender' }),
    };
    if (flags['a-name'] !== undefined) personA.name = flags['a-name'];
    if (flags['b-name'] !== undefined) personB.name = flags['b-name'];

    const body = { personA, personB };
    const path = '/api/synastry/analyze';

    if (flags['dry-run']) {
      const preview = describeRequest({ method: 'POST', path, body });
      return out.ok(
        preview,
        (d) => `会发送 POST ${d.wouldRequest.url}\n${JSON.stringify(body, null, 2)}`
      );
    }

    out.step('向引擎请求合盘分析');
    const data = await callApi(path, { method: 'POST', body, timeoutMs: resolveTimeout(flags) });
    return out.ok(data, (d) => {
      const score = d.compatibility?.score;
      const a = `${d.personA?.name || 'A'}（日主 ${d.personA?.dayMaster || '?'}）`;
      const b = `${d.personB?.name || 'B'}（日主 ${d.personB?.dayMaster || '?'}）`;
      return [`${a}  ×  ${b}`, score === undefined ? null : `相性评分: ${score}`]
        .filter(Boolean)
        .join('\n');
    });
  },
});

const ZODIAC_PERIODS = ['daily', 'weekly', 'monthly'];

const zodiacCommand = defineCommand({
  name: 'zodiac',
  summary: '西洋星座：星座信息或运势',
  usage: 'bazi calc zodiac <sign> [选项]',
  args: [{ name: 'sign', required: true, summary: '星座名，如 aries / taurus / leo' }],
  flags: [
    {
      name: 'horoscope',
      type: 'string',
      summary: `取运势而非星座信息（${ZODIAC_PERIODS.join(' / ')}）`,
    },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    { note: '查星座信息', command: 'bazi calc zodiac leo --json' },
    { note: '查本周运势', command: 'bazi calc zodiac leo --horoscope weekly --json' },
  ],
  run: async ({ flags, positionals, out }) => {
    const sign = positionals[0];
    if (!sign) {
      throw usageError('缺少星座名', { next: 'bazi calc zodiac leo --json' });
    }

    const period = flags.horoscope;
    if (period !== undefined && !ZODIAC_PERIODS.includes(period)) {
      throw usageError(`--horoscope 只接受 ${ZODIAC_PERIODS.join(' / ')}，收到 "${period}"`, {
        next: 'bazi calc zodiac leo --horoscope daily --json',
      });
    }

    const path =
      period === undefined
        ? `/api/zodiac/${encodeURIComponent(sign)}`
        : `/api/zodiac/${encodeURIComponent(sign)}/horoscope?period=${encodeURIComponent(period)}`;

    if (flags['dry-run']) {
      const preview = describeRequest({ method: 'GET', path });
      return out.ok(preview, (d) => `会发送 GET ${d.wouldRequest.url}`);
    }

    out.step(`向引擎请求 ${sign} 的${period ? `${period} 运势` : '星座信息'}`);
    const data = await callApi(path, { timeoutMs: resolveTimeout(flags) });
    return out.ok(data, (d) => d.summary || d.description || '完整结果请用 --json');
  },
});

export const calcCommand = defineCommand({
  name: 'calc',
  summary: '算法能力：确定性推算（八字 / 紫微 / 合盘 / 星座）',
  description:
    '这些命令是引擎的客户端，跑之前引擎必须在跑（bazi stack up --only api）。\n' +
    '连不上会退 3 并给出拉起引擎的命令；引擎拒绝请求退 4；被限流退 5。',
  commands: [baziCommand, ziweiCommand, synastryCommand, zodiacCommand],
  examples: [
    {
      note: '排一张八字盘',
      command: 'bazi calc bazi --birth 1990-05-20T14:30 --gender male --json',
    },
  ],
});

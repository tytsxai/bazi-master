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

/**
 * 引擎的五行、生克、十神都用英文枚举作为机器契约（HTTP 响应里保持不变），
 * 但 CLI 是给人看的，一律译回中文。译不出来时原样透出，不吞掉信息。
 */
const ELEMENT_CN = { Wood: '木', Fire: '火', Earth: '土', Metal: '金', Water: '水' };

const RELATION_CN = {
  Same: '同气',
  Generates: '生',
  GeneratedBy: '被生',
  Controls: '克',
  ControlledBy: '被克',
  Unknown: '未知',
};

const el = (value) => ELEMENT_CN[value] || value || '?';
const rel = (value) => RELATION_CN[value] || value || '?';

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
    const elements = [pillar.elementStem, pillar.elementBranch].filter(Boolean).map(el).join('/');
    // 罗马字转写（Geng Wu）对中文使用者是噪音，要拿它去 --json 里取 stem/branch
    lines.push(`  ${label}  ${(chars || '--').padEnd(6)}${elements}`);
  }
  return lines.length > 1 ? lines.join('\n') : null;
};

const renderFiveElements = (fiveElements) => {
  if (!fiveElements || typeof fiveElements !== 'object') return null;
  const entries = Object.entries(fiveElements).filter(([, v]) => typeof v === 'number');
  if (!entries.length) return null;
  return `五行: ${entries.map(([k, v]) => `${el(k)} ${v}`).join('  ')}`;
};

/**
 * 真太阳时的状态必须显式打出来，因为它**会改写时柱**。
 *
 * 给了地点与时区时，引擎按校正后的时刻排盘，上面那几柱就不是钟表时间那张盘。
 * 所以这里要把「实际用了几点」和「原始钟表几点」一并回显 —— 两者差一个时辰，
 * 盘就差一柱，而这件事不会以任何形式报错。
 */
const renderSolarTime = (chartTime) => {
  const solar = chartTime?.trueSolarTime;
  if (!solar || !solar.applied) {
    return '真太阳时: 未校正（需要同时给 --location 和 --timezone），四柱按钟表时间排';
  }
  const place = solar.location?.name || '未知地点';
  const minutes = solar.correctionMinutes;
  const delta = typeof minutes === 'number' ? `${minutes > 0 ? '+' : ''}${minutes} 分钟` : '未知';
  const used = chartTime.used;
  const clock = solar.clockTime;
  const usedText = used ? `${used.hour}:${String(used.minute ?? 0).padStart(2, '0')}` : '未知';
  const clockText = clock ? `${clock.hour}:${String(clock.minute ?? 0).padStart(2, '0')}` : '未知';
  return `真太阳时: 已校正 ${delta}（${place}）—— 排盘用的是 ${usedText}，钟表时间为 ${clockText}`;
};

const renderBazi = (data) =>
  [
    renderPillars(data.pillars),
    renderFiveElements(data.fiveElements),
    data.analysis?.strength
      ? `旺衰: ${data.analysis.strength.levelCn}（同党占比 ${data.analysis.strength.ratio}）`
      : null,
    data.analysis?.usefulGod
      ? `用神: ${data.analysis.usefulGod.favorable.map(el).join('/') || '（中和，宜改用调候或病药法）'}`
      : null,
    renderSolarTime(data.chartTime),
  ]
    .filter(Boolean)
    .join('\n');

// ------------------------------------------------------------------ 子命令

const baziCommand = defineCommand({
  name: 'bazi',
  summary: '八字排盘：四柱、五行、十神、大运',
  description:
    '纯计算，不写任何状态。\n' +
    '给了 --location 与 --timezone 时，四柱按**真太阳时**排 —— 校正量在中国西部可超过两小时，' +
    '足以把时柱推到隔壁一柱；不给则按钟表时间排。响应的 chartTime 会回显实际所用时刻。',
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
      const ming = palaces[d.mingPalace?.index];
      const starsOf = (p) =>
        [...(p?.stars?.major || []), ...(p?.stars?.minor || []), ...(p?.stars?.malefic || [])]
          .map((x) => x.cn)
          .join(' ') || '无主星';
      return [
        `${d.fiveElementBureau?.cn || '?'}（${d.fiveElementBureau?.nayin || '?'}·命宫 ${d.fiveElementBureau?.mingGanzhi || '?'}）`,
        `命宫 ${ming?.branch?.key || '?'}：${starsOf(ming)}`,
        `身宫 ${palaces[d.shenPalace?.index]?.branch?.key || '?'}`,
        `本命四化：${(d.fourTransformations || []).map((t) => `${t.starCn}${t.typeCn}`).join(' ')}`,
        `大限起 ${d.majorPeriods?.[0]?.startAge || '?'} 岁，${d.majorPeriodDirection === 1 ? '顺' : '逆'}行`,
        '十二宫详情用 --json',
      ].join('\n');
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
      const c = d.compatibility;
      // personA.dayMaster 是罗马字（Yi），compatibility.dayMasters 里才是汉字
      const a = `甲方 ${c?.dayMasters?.stemA || d.personA?.dayMaster || '?'}${el(d.personA?.element)}`;
      const b = `乙方 ${c?.dayMasters?.stemB || d.personB?.dayMaster || '?'}${el(d.personB?.element)}`;
      return [
        `${a}  ×  ${b}`,
        score === undefined ? null : `相性评分: ${score}`,
        c?.dayMasters
          ? `日主关系：${rel(c.dayMasters.relation)}（互看十神 ${c.dayMasters.tenGodAtoB?.cn || '?'} / ${c.dayMasters.tenGodBtoA?.cn || '?'}）`
          : null,
        c?.spousePalace
          ? `夫妻宫 ${c.spousePalace.branchA}${c.spousePalace.branchB}：${c.spousePalace.relations.map((r) => r.cn).join('、') || '无合无冲'}`
          : null,
        c?.crossPillars?.length ? `交叉：${c.crossPillars.map((r) => r.cn).join(' ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });
  },
});

const ZODIAC_PERIODS = ['daily', 'weekly', 'monthly'];

/** 十二星座的中文名。引擎返回英文键名，CLI 一律译出。 */
const ZODIAC_CN = {
  aries: '白羊座',
  taurus: '金牛座',
  gemini: '双子座',
  cancer: '巨蟹座',
  leo: '狮子座',
  virgo: '处女座',
  libra: '天秤座',
  scorpio: '天蝎座',
  sagittarius: '射手座',
  capricorn: '摩羯座',
  aquarius: '水瓶座',
  pisces: '双鱼座',
};

/** 守护星、象征、宫性的中文名 —— 这些是界面元素，一律译出。 */
const PLANET_CN = {
  Sun: '太阳',
  Moon: '月亮',
  Mercury: '水星',
  Venus: '金星',
  Mars: '火星',
  Jupiter: '木星',
  Saturn: '土星',
  Uranus: '天王星',
  Neptune: '海王星',
  Pluto: '冥王星',
};

const SYMBOL_CN = {
  'The Ram': '白羊',
  'The Bull': '金牛',
  'The Twins': '双子',
  'The Crab': '巨蟹',
  'The Lion': '狮子',
  'The Maiden': '处女',
  'The Scales': '天秤',
  'The Scorpion': '天蝎',
  'The Archer': '射手',
  'The Goat': '山羊',
  'The Water Bearer': '宝瓶',
  'The Fish': '双鱼',
};

const MODALITY_CN = { Cardinal: '基本宫', Fixed: '固定宫', Mutable: '变动宫' };

const signCn = (value) => {
  const key = String(value || '').toLowerCase();
  return ZODIAC_CN[key] ? `${ZODIAC_CN[key]}（${value}）` : value || '?';
};

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
    return out.ok(data, (d) => {
      const info = d.sign || d.horoscope || d;
      const head = signCn(info.key || info.value || sign);
      const meta = [
        info.dateRange,
        info.element ? `${el(info.element)}象` : null,
        MODALITY_CN[info.modality] || info.modality,
        info.rulingPlanet ? `守护星 ${PLANET_CN[info.rulingPlanet] || info.rulingPlanet}` : null,
        SYMBOL_CN[info.symbol] ? `象征 ${SYMBOL_CN[info.symbol]}` : null,
      ]
        .filter(Boolean)
        .join('  ');
      // keywords / strengths 是西方星座的原生英文描述，属内容而非界面，保留原文
      const body =
        info.summary ||
        info.description ||
        (info.keywords?.length ? `关键词：${info.keywords.join('、')}` : null) ||
        '完整结果请用 --json';
      return [head, meta || null, body].filter(Boolean).join('\n');
    });
  },
});

// ------------------------------------------------- 起课类：以日期时辰为输入

/**
 * 解析 --date（YYYY-MM-DD）与 --hour。
 *
 * 不给日期就落到引擎侧的「当日当时」—— 那样结果**不可复现**，所以这里把
 * 「有没有显式给」如实返回，由各命令在输出里标出来。calc 的确定性契约只在
 * 显式给全输入时成立，含糊过去会让人拿一个当日盘去做回归比对。
 */
const parseCastDate = (flags, { flag = '--date' } = {}) => {
  const raw = flags.date;
  const result = { explicit: false };

  if (raw !== undefined) {
    const match = String(raw).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) {
      throw usageError(`${flag} 需要 YYYY-MM-DD 格式，收到 "${raw}"`, {
        next: 'bazi calc liuren --date 2024-05-20 --hour 14 --json',
      });
    }
    result.year = Number(match[1]);
    result.month = Number(match[2]);
    result.day = Number(match[3]);
    result.explicit = true;
  }

  if (flags.hour !== undefined) {
    const hour = Number(flags.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw usageError(`--hour 需要 0..23 的整数，收到 "${flags.hour}"`, {
        next: 'bazi calc liuren --date 2024-05-20 --hour 14 --json',
      });
    }
    result.hour = hour;
  }

  return result;
};

const CAST_DATE_FLAGS = [
  {
    name: 'date',
    type: 'string',
    summary: '起课日期 YYYY-MM-DD（不给则取引擎当日，结果不可复现）',
  },
  { name: 'hour', type: 'number', summary: '起课时辰 0..23（不给则取引擎当下）' },
  { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
];

/** 各命令的 dry-run 分支长得一样，收敛掉。 */
const previewOrCall = async ({ flags, out, path, body, method = 'POST', step, render }) => {
  if (flags['dry-run']) {
    const preview = describeRequest({ method, path, body });
    return out.ok(preview, (d) =>
      body === undefined
        ? `会发送 ${method} ${d.wouldRequest.url}`
        : `会发送 ${method} ${d.wouldRequest.url}\n${JSON.stringify(body, null, 2)}`
    );
  }
  out.step(step);
  const data = await callApi(path, { method, body, timeoutMs: resolveTimeout(flags) });
  return out.ok(data, render);
};

/** 未显式给日期时的提醒，附在渲染结果末尾。 */
const castDateNote = (explicit, actual) =>
  explicit ? null : `（未指定 --date，用的是引擎当日 ${actual || '?'}，此结果不可复现）`;

const liuyaoCommand = defineCommand({
  name: 'liuyao',
  summary: '六爻纳甲装卦：世应、六亲、六神、伏神、变卦',
  description:
    '装卦不是起卦：六爻由 --lines 给定，引擎只负责装。\n' +
    '起卦日决定六神与旬空，不给 --date 则取引擎当日。',
  flags: [
    { name: 'lines', type: 'string', summary: '六爻，自初爻起，0 阴 1 阳，如 111111' },
    { name: 'changing', type: 'string', summary: '动爻位，逗号分隔，如 1,3（可选）' },
    ...CAST_DATE_FLAGS,
  ],
  examples: [
    { note: '乾为天初爻动', command: 'bazi calc liuyao --lines 111111 --changing 1 --json' },
    {
      note: '指定起卦日（可复现）',
      command: 'bazi calc liuyao --lines 010101 --date 2024-05-20 --json',
    },
  ],
  run: async ({ flags, out }) => {
    if (flags.lines === undefined) {
      throw usageError('缺少 --lines', {
        next: 'bazi calc liuyao --lines 111111 --json',
      });
    }
    const raw = String(flags.lines).trim();
    if (!/^[01]{6}$/.test(raw)) {
      throw usageError(`--lines 需要六位 0/1（自初爻起），收到 "${flags.lines}"`, {
        next: 'bazi calc liuyao --lines 111111 --json',
      });
    }
    const lines = raw.split('').map(Number);

    let changingLines = [];
    if (flags.changing !== undefined) {
      changingLines = String(flags.changing)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
      if (changingLines.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) {
        throw usageError(`--changing 只接受 1..6 的爻位，收到 "${flags.changing}"`, {
          next: 'bazi calc liuyao --lines 111111 --changing 1,3 --json',
        });
      }
    }

    const date = parseCastDate(flags);
    const body = { lines, changingLines };
    if (date.explicit) Object.assign(body, { year: date.year, month: date.month, day: date.day });

    return previewOrCall({
      flags,
      out,
      path: '/api/liuyao/chart',
      body,
      step: '向引擎请求六爻装卦',
      render: (d) => {
        const shi = d.yaos?.find((y) => y.isShi);
        const ying = d.yaos?.find((y) => y.isYing);
        const rows = (d.yaos || [])
          .slice()
          .reverse()
          .map((y) => {
            const mark = y.isShi ? '世' : y.isYing ? '应' : '  ';
            const moving = y.isChanging ? ' ○动' : '';
            return `  ${y.position}爻 ${mark} ${y.ganzhi} ${y.relative?.cn || ''} ${y.sixGod?.cn || ''}${moving}`;
          });
        return [
          `${d.name?.cn || '?'}（${d.palace?.palaceCn || '?'}宫 ${d.palace?.typeCn || ''}）`,
          `世爻 ${shi?.position || '?'}  应爻 ${ying?.position || '?'}  旬空 ${(d.xunkong?.branches || []).join('')}`,
          ...rows,
          d.changedHexagram ? `之卦: ${d.changedHexagram.name?.cn || '?'}` : null,
          d.hiddenSpirits?.length
            ? `伏神: ${d.hiddenSpirits.map((h) => `${h.branch}${h.relative?.cn}`).join(' ')}`
            : null,
          castDateNote(date.explicit, d.castDate?.dayGanzhi),
        ]
          .filter(Boolean)
          .join('\n');
      },
    });
  },
});

const liurenCommand = defineCommand({
  name: 'liuren',
  summary: '大六壬起课：天地盘、四课、三传、十二天将',
  description: '月将取月建六合、以中气换将。三传九宗门全备，课体名目在 courseType 里。',
  flags: CAST_DATE_FLAGS,
  examples: [
    {
      note: '指定日期时辰（可复现）',
      command: 'bazi calc liuren --date 2024-05-20 --hour 14 --json',
    },
    { note: '当下起课', command: 'bazi calc liuren --json' },
  ],
  run: async ({ flags, out }) => {
    const date = parseCastDate(flags);
    const body = {};
    if (date.explicit) Object.assign(body, { year: date.year, month: date.month, day: date.day });
    if (date.hour !== undefined) body.hour = date.hour;

    return previewOrCall({
      flags,
      out,
      path: '/api/liuren/chart',
      body,
      step: '向引擎请求六壬起课',
      render: (d) => {
        const tri = d.threeTransmissions;
        const courses = (d.fourCourses || [])
          .map((c, i) => `${i + 1}课 ${c.upper}/${c.lower}`)
          .join('  ');
        return [
          `${d.dayGanzhi} 日 ${d.hourBranch}时  月将 ${d.monthGeneral?.branch}${d.monthGeneral?.cn}`,
          `四课: ${courses}`,
          tri
            ? `三传: ${tri.courseType?.cn} ${[tri.initial?.branch, tri.middle?.branch, tri.last?.branch].join(' → ')}`
            : null,
          `贵人: ${d.twelveGenerals?.nobleBranch}（${d.twelveGenerals?.isDaytime ? '昼' : '夜'}贵，${d.twelveGenerals?.forward ? '顺' : '逆'}行）`,
          d.isFuyin ? '伏吟课（天地盘重合）' : d.isFanyin ? '返吟课（天地盘全冲）' : null,
          castDateNote(date.explicit, d.dayGanzhi),
        ]
          .filter(Boolean)
          .join('\n');
      },
    });
  },
});

const qimenCommand = defineCommand({
  name: 'qimen',
  summary: '奇门遁甲排局：三奇六仪、九星八门八神、值符值使',
  description: '定局用拆补法，天盘用转盘法。格局判定不由引擎给出（属断语层）。',
  flags: CAST_DATE_FLAGS,
  examples: [
    { note: '指定日期时辰', command: 'bazi calc qimen --date 2024-05-20 --hour 14 --json' },
  ],
  run: async ({ flags, out }) => {
    const date = parseCastDate(flags);
    const body = {};
    if (date.explicit) Object.assign(body, { year: date.year, month: date.month, day: date.day });
    if (date.hour !== undefined) body.hour = date.hour;

    return previewOrCall({
      flags,
      out,
      path: '/api/qimen/chart',
      body,
      step: '向引擎请求奇门排局',
      render: (d) => {
        const rows = (d.palaces || []).map((p) => {
          const parts = [
            p.cn,
            `地${p.earthStem || '-'}`,
            `天${p.heavenStem || '-'}`,
            p.star?.cn || '--',
            p.gate?.cn || '--',
            p.god?.cn || '--',
          ];
          // 八神里本来就有一位叫「值符」，所以宫位标记用方括号区分，否则一行里两个值符分不清
          const marks = [p.isZhifu ? '[符]' : '', p.isZhishi ? '[使]' : '']
            .filter(Boolean)
            .join('');
          return `  ${parts.join(' ')} ${marks}`.trimEnd();
        });
        return [
          `${d.ju?.dunCn}${d.ju?.ju}局  ${d.ju?.jieqi}·${d.ju?.yuanCn}  ${d.dayGanzhi}日 ${d.hourGanzhi}时`,
          `旬首 ${d.xunshou} 遁 ${d.dunYi}`,
          ...rows,
          castDateNote(date.explicit, d.dayGanzhi),
        ]
          .filter(Boolean)
          .join('\n');
      },
    });
  },
});

// ------------------------------------------------------------ 风水 / 择吉 / 姓名

const bazhaiCommand = defineCommand({
  name: 'bazhai',
  summary: '八宅风水：本命卦与八方吉凶',
  description: '给了 --birth 就以立春为界定年 —— 正月初出生可能算作上一年，命卦因此不同。',
  flags: [
    { name: 'birth', type: 'string', summary: '出生日期 YYYY-MM-DD 或仅年份 YYYY' },
    { name: 'gender', type: 'string', summary: '性别（male / female）' },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    { note: '只给年份', command: 'bazi calc bazhai --birth 1990 --gender male --json' },
    {
      note: '给全日期（立春前后命卦可能不同）',
      command: 'bazi calc bazhai --birth 1990-02-01 --gender male --json',
    },
  ],
  run: async ({ flags, out }) => {
    if (flags.birth === undefined) {
      throw usageError('缺少 --birth', {
        next: 'bazi calc bazhai --birth 1990 --gender male --json',
      });
    }
    const raw = String(flags.birth).trim();
    const full = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const yearOnly = raw.match(/^(\d{4})$/);
    if (!full && !yearOnly) {
      throw usageError(`--birth 需要 YYYY 或 YYYY-MM-DD，收到 "${raw}"`, {
        next: 'bazi calc bazhai --birth 1990 --gender male --json',
      });
    }

    const body = {
      birthYear: Number(full ? full[1] : yearOnly[1]),
      gender: parseGender(flags.gender),
    };
    if (full) {
      body.birthMonth = Number(full[2]);
      body.birthDay = Number(full[3]);
    }

    return previewOrCall({
      flags,
      out,
      path: '/api/fengshui/bazhai',
      body,
      step: '向引擎请求八宅命卦',
      render: (d) => {
        const rows = (d.younian || []).map(
          (y) =>
            `  ${y.direction?.padEnd(4) || '?'} ${y.trigram} ${y.star?.cn}${y.star?.auspicious ? '（吉）' : '（凶）'}`
        );
        return [
          `本命卦: ${d.lifeTrigram?.cn}${d.lifeTrigram?.number}（${d.lifeTrigram?.groupCn}，按 ${d.lifeTrigram?.solarYearUsed} 年取）`,
          `吉方: ${(d.auspiciousDirections || []).join(' ')}`,
          `凶方: ${(d.inauspiciousDirections || []).join(' ')}`,
          ...rows,
        ].join('\n');
      },
    });
  },
});

const almanacCommand = defineCommand({
  name: 'almanac',
  summary: '择吉历注：建除、值宿、吉神凶煞、彭祖百忌',
  flags: [
    { name: 'date', type: 'string', summary: '日期 YYYY-MM-DD（不给则取引擎当日）' },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [{ note: '查某日历注', command: 'bazi calc almanac --date 2024-05-20 --json' }],
  run: async ({ flags, out }) => {
    const date = parseCastDate(flags);
    const query = date.explicit ? `?year=${date.year}&month=${date.month}&day=${date.day}` : '';

    return previewOrCall({
      flags,
      out,
      method: 'GET',
      path: `/api/fengshui/almanac${query}`,
      step: '向引擎请求当日历注',
      render: (d) =>
        [
          // monthCn 只给「四」不带「月」字，直接拼会得到「四十三」这种读不出来的东西
          `${d.date?.year}-${d.date?.month}-${d.date?.day}  ${d.ganzhi?.day}日  农历${d.lunarDate?.monthCn}月${d.lunarDate?.dayCn}`,
          `建除: ${d.zhiXing}    值宿: ${d.xiu?.name}（${d.xiu?.luck}）${d.xiu?.animal || ''}`,
          `吉神: ${(d.auspiciousGods || []).join(' ') || '无'}`,
          `凶煞: ${(d.inauspiciousGods || []).join(' ') || '无'}`,
          `彭祖: ${d.pengzu?.gan || ''} ${d.pengzu?.zhi || ''}`,
          castDateNote(date.explicit, d.ganzhi?.day),
        ]
          .filter(Boolean)
          .join('\n'),
    });
  },
});

const nameCommand = defineCommand({
  name: 'name',
  summary: '姓名五格与三才',
  description:
    '笔画数由你提供，引擎不内置字典 —— 康熙笔画与简体差异很大，部首另有独立算法\n' +
    '（「氵」按「水」计四画）。传的是笔画数不是汉字。',
  flags: [
    { name: 'surname', type: 'string', summary: '姓的逐字笔画，逗号分隔，如 7 或 5,6' },
    { name: 'given', type: 'string', summary: '名的逐字笔画，逗号分隔，如 8 或 8,9' },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    { note: '单姓单名', command: 'bazi calc name --surname 7 --given 8 --json' },
    { note: '复姓双名', command: 'bazi calc name --surname 5,6 --given 8,9 --json' },
  ],
  run: async ({ flags, out }) => {
    const parseStrokes = (value, flag) => {
      if (value === undefined) {
        throw usageError(`缺少 ${flag}`, { next: 'bazi calc name --surname 7 --given 8 --json' });
      }
      const parts = String(value)
        .split(',')
        .map((s) => Number(s.trim()));
      if (!parts.length || parts.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) {
        throw usageError(`${flag} 需要 1..99 的整数笔画，逗号分隔，收到 "${value}"`, {
          next: 'bazi calc name --surname 7 --given 8 --json',
        });
      }
      return parts;
    };

    const body = {
      surnameStrokes: parseStrokes(flags.surname, '--surname'),
      givenNameStrokes: parseStrokes(flags.given, '--given'),
    };

    return previewOrCall({
      flags,
      out,
      path: '/api/fengshui/name',
      body,
      step: '向引擎请求姓名五格',
      render: (d) => {
        const g = d.grids || {};
        const e = d.gridElements || {};
        return [
          `天格 ${g.heaven}(${el(e.heaven)})  人格 ${g.human}(${el(e.human)})  地格 ${g.earth}(${el(e.earth)})`,
          `外格 ${g.outer}(${el(e.outer)})  总格 ${g.total}(${el(e.total)})`,
          `三才: ${el(d.sancai?.heaven)} → ${el(d.sancai?.human)} → ${el(d.sancai?.earth)}`,
          `关系: 天对人 ${rel(d.sancaiRelations?.heavenToHuman)}，人对地 ${rel(d.sancaiRelations?.humanToEarth)}`,
        ].join('\n');
      },
    });
  },
});

// ------------------------------------------------------ 流日 / 上升星座

const dailyCommand = defineCommand({
  name: 'daily',
  summary: '流日：当日日柱，给了出生信息则结合本命盘',
  description:
    '不给出生信息时只返回当日日柱；要结合本命盘就把 --birth 与 --gender 一起给全，\n' +
    '缺一个引擎会退 4。fortune.branchRelations 给的是流日地支与本命日支的客观关系，\n' +
    'score 只是按这些关系折算的粗略指标。',
  flags: [
    { name: 'birth', type: 'string', summary: '出生时刻 YYYY-MM-DDTHH:mm（可选）' },
    { name: 'gender', type: 'string', summary: '性别（male / female），与 --birth 同进同退' },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    { note: '只看当日日柱', command: 'bazi calc daily --json' },
    {
      note: '结合本命盘',
      command: 'bazi calc daily --birth 1990-05-20T14:30 --gender male --json',
    },
  ],
  run: async ({ flags, out }) => {
    const params = new URLSearchParams();
    if (flags.birth !== undefined) {
      const birth = parseBirth(flags.birth, { flag: '--birth' });
      params.set('birthYear', birth.birthYear);
      params.set('birthMonth', birth.birthMonth);
      params.set('birthDay', birth.birthDay);
      params.set('birthHour', birth.birthHour);
      params.set('gender', parseGender(flags.gender));
    }
    const query = params.toString();
    const path = `/api/calendar/daily${query ? `?${query}` : ''}`;

    return previewOrCall({
      flags,
      out,
      method: 'GET',
      path,
      step: '向引擎请求流日',
      render: (d) => {
        const p = d.dailyPillar || {};
        const f = d.fortune;
        const lines = [`${d.date}  日柱 ${(p.charStem || '') + (p.charBranch || '')}`];
        // 不给出生信息时引擎只回一句 message，没有 score —— 别照着有分数的形状渲染
        if (typeof f?.score === 'number') {
          lines.push(`流日分数 ${f.score}（流日天干对日主：${rel(f.dayMasterRelation)}）`);
          lines.push(
            f.branchRelations?.length
              ? `与本命日支：${f.branchRelations.map((r) => r.cn).join('、')}`
              : '与本命日支：无合无冲'
          );
        } else if (f?.message) {
          lines.push('未给出生信息，只返回当日日柱（要个人化流日就把 --birth 与 --gender 给全）');
        }
        return lines.join('\n');
      },
    });
  },
});

const risingCommand = defineCommand({
  name: 'rising',
  summary: '上升星座：按出生时刻与经纬度计算',
  description:
    '需要经纬度与时区偏移 —— 上升星座对地点和时刻都敏感，差几分钟就可能换一个星座。\n' +
    '--location 只接受 "纬度,经度" 坐标串，这里不走八字那张城市表。',
  flags: [
    { name: 'birth', type: 'string', summary: '出生时刻 YYYY-MM-DDTHH:mm' },
    { name: 'location', type: 'string', summary: '"纬度,经度"，如 "39.90,116.40"' },
    { name: 'tz-offset', type: 'number', summary: '时区偏移分钟数，东八区为 480' },
    { name: 'timeout', type: 'number', summary: '请求超时毫秒数' },
  ],
  examples: [
    {
      note: '北京出生',
      command:
        'bazi calc rising --birth 1990-05-20T14:30 --location "39.90,116.40" --tz-offset 480 --json',
    },
  ],
  run: async ({ flags, out }) => {
    if (flags.birth === undefined) {
      throw usageError('缺少 --birth', {
        next: 'bazi calc rising --birth 1990-05-20T14:30 --location "39.90,116.40" --tz-offset 480 --json',
      });
    }
    const coords = String(flags.location || '').match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
    );
    if (!coords) {
      throw usageError('--location 需要 "纬度,经度" 坐标串', {
        next: 'bazi calc rising --birth 1990-05-20T14:30 --location "39.90,116.40" --tz-offset 480 --json',
      });
    }
    const offset = Number(flags['tz-offset']);
    if (!Number.isInteger(offset)) {
      throw usageError('--tz-offset 需要整数分钟数（东八区为 480）', {
        next: 'bazi calc rising --birth 1990-05-20T14:30 --location "39.90,116.40" --tz-offset 480 --json',
      });
    }

    const birth = parseBirth(flags.birth, { flag: '--birth' });
    const pad = (n) => String(n).padStart(2, '0');
    const body = {
      birthDate: `${birth.birthYear}-${pad(birth.birthMonth)}-${pad(birth.birthDay)}`,
      birthTime: `${pad(birth.birthHour)}:${pad(birth.birthMinute || 0)}`,
      timezoneOffsetMinutes: offset,
      latitude: Number(coords[1]),
      longitude: Number(coords[2]),
    };

    return previewOrCall({
      flags,
      out,
      path: '/api/zodiac/rising',
      body,
      step: '向引擎请求上升星座',
      render: (d) =>
        [
          `上升星座: ${signCn(d.rising?.value || d.rising?.name)}${d.rising?.dateRange ? `  ${d.rising.dateRange}` : ''}`,
          d.ascendant?.longitude !== undefined
            ? `上升黄经 ${d.ascendant.longitude}°  地方恒星时 ${d.ascendant.localSiderealTime}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
    });
  },
});

export const calcCommand = defineCommand({
  name: 'calc',
  summary:
    '算法能力：确定性推算（八字 / 紫微 / 六爻 / 六壬 / 奇门 / 风水 / 择吉 / 姓名 / 合盘 / 星座）',
  description:
    '这些命令是引擎的客户端，跑之前引擎必须在跑（bazi stack up --only api）。\n' +
    '连不上会退 3 并给出拉起引擎的命令；引擎拒绝请求退 4；被限流退 5。\n\n' +
    '起课类命令（liuren / qimen / liuyao / almanac）不给 --date 时取引擎当日，\n' +
    '**此时结果不可复现**，输出末尾会标注。要可复现就显式给 --date 和 --hour。',
  commands: [
    baziCommand,
    ziweiCommand,
    liuyaoCommand,
    liurenCommand,
    qimenCommand,
    bazhaiCommand,
    almanacCommand,
    nameCommand,
    synastryCommand,
    zodiacCommand,
    risingCommand,
    dailyCommand,
  ],
  examples: [
    {
      note: '排一张八字盘',
      command: 'bazi calc bazi --birth 1990-05-20T14:30 --gender male --json',
    },
    { note: '六爻装卦', command: 'bazi calc liuyao --lines 111111 --changing 1 --json' },
    { note: '奇门排局', command: 'bazi calc qimen --date 2024-05-20 --hour 14 --json' },
  ],
});

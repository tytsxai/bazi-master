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
      ? `用神: ${data.analysis.usefulGod.favorable.join('/') || '（中和，宜改用调候或病药法）'}`
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
        // 引擎回的五行与生克关系都是英文枚举，面向人的输出得译回来
        const ELEMENT_CN = { Wood: '木', Fire: '火', Earth: '土', Metal: '金', Water: '水' };
        const RELATION_CN = {
          Same: '同气',
          Generates: '生',
          GeneratedBy: '被生',
          Controls: '克',
          ControlledBy: '被克',
        };
        const el = (v) => ELEMENT_CN[v] || v || '?';
        const rel = (v) => RELATION_CN[v] || v || '?';
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

import { Solar } from 'lunar-javascript';
import { BRANCHES_MAP, ELEMENTS, STEMS_MAP } from '../constants/stems.js';
import {
  buildBaziCacheKey,
  getCachedBaziCalculationAsync,
  setBaziCacheEntry,
} from '../baziCache.js';
import { resolveLocationCoordinates, computeTrueSolarTime } from '../solarTime.js';
import { buildBirthTimeMeta, parseTimezoneOffsetMinutes } from '../timezone.js';

export function getElementRelation(me, other) {
  if (me === other) return 'Same';

  const meIdx = ELEMENTS.indexOf(me);
  const otherIdx = ELEMENTS.indexOf(other);

  if ((meIdx + 1) % 5 === otherIdx) return 'Generates';
  if ((otherIdx + 1) % 5 === meIdx) return 'GeneratedBy';
  if ((meIdx + 2) % 5 === otherIdx) return 'Controls';
  if ((otherIdx + 2) % 5 === meIdx) return 'ControlledBy';

  return 'Unknown';
}

export function calculateTenGod(dayMasterStemVal, targetStemVal) {
  const dm = STEMS_MAP[dayMasterStemVal];
  const target = STEMS_MAP[targetStemVal];

  if (!dm || !target) return 'Unknown';

  const relation = getElementRelation(dm.element, target.element);
  const samePolarity = dm.polarity === target.polarity;

  switch (relation) {
    case 'Same':
      return samePolarity ? 'Friend (Bi Jian)' : 'Rob Wealth (Jie Cai)';
    case 'Generates':
      return samePolarity ? 'Eating God (Shi Shen)' : 'Hurting Officer (Shang Guan)';
    case 'GeneratedBy':
      return samePolarity ? 'Indirect Resource (Pian Yin)' : 'Direct Resource (Zheng Yin)';
    case 'Controls':
      return samePolarity ? 'Indirect Wealth (Pian Cai)' : 'Direct Wealth (Zheng Cai)';
    case 'ControlledBy':
      return samePolarity ? 'Seven Killings (Qi Sha)' : 'Direct Officer (Zheng Guan)';
    default:
      return 'Unknown';
  }
}

export function buildPillar(ganChar, zhiChar) {
  const ganInfo = STEMS_MAP[ganChar] || { name: ganChar, element: 'Unknown' };
  const zhiInfo = BRANCHES_MAP[zhiChar] || { name: zhiChar, element: 'Unknown' };

  return {
    stem: ganInfo.name,
    branch: zhiInfo.name,
    elementStem: ganInfo.element,
    elementBranch: zhiInfo.element,
    charStem: ganChar,
    charBranch: zhiChar,
  };
}

const getCharStemEquivalent = (char) => {
  if (STEMS_MAP[char]) return char;
  const branchToMainQi = {
    '子': '癸', '丑': '己', '寅': '甲', '卯': '乙', '辰': '戊', '巳': '丙',
    '午': '丁', '未': '己', '申': '庚', '酉': '辛', '戌': '戊', '亥': '壬'
  };
  return branchToMainQi[char];
};

export const performCalculation = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = data;

  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const yearPillar = buildPillar(eightChar.getYearGan(), eightChar.getYearZhi());
  const monthPillar = buildPillar(eightChar.getMonthGan(), eightChar.getMonthZhi());
  const dayPillar = buildPillar(eightChar.getDayGan(), eightChar.getDayZhi());
  const hourPillar = buildPillar(eightChar.getTimeGan(), eightChar.getTimeZhi());

  const pillars = {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
  };

  const counts = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  const addCount = (el) => { if (counts[el] !== undefined) counts[el]++; };

  [yearPillar, monthPillar, dayPillar, hourPillar].forEach((pillar) => {
    addCount(pillar.elementStem);
    addCount(pillar.elementBranch);
  });
  const totalElements = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const fiveElementsPercent = ELEMENTS.reduce((acc, element) => {
    acc[element] = totalElements ? Math.round((counts[element] / totalElements) * 100) : 0;
    return acc;
  }, {});

  const dayMasterChar = eightChar.getDayGan();
  const tenGodsCounts = {};

  const allTenGodsTypes = [
    'Friend (Bi Jian)', 'Rob Wealth (Jie Cai)',
    'Eating God (Shi Shen)', 'Hurting Officer (Shang Guan)',
    'Indirect Wealth (Pian Cai)', 'Direct Wealth (Zheng Cai)',
    'Seven Killings (Qi Sha)', 'Direct Officer (Zheng Guan)',
    'Indirect Resource (Pian Yin)', 'Direct Resource (Zheng Yin)'
  ];
  allTenGodsTypes.forEach((type) => { tenGodsCounts[type] = 0; });

  const scanParts = [
    yearPillar.charStem, yearPillar.charBranch,
    monthPillar.charStem, monthPillar.charBranch,
    dayPillar.charBranch,
    hourPillar.charStem, hourPillar.charBranch,
  ];

  scanParts.forEach((char) => {
    const stemVal = getCharStemEquivalent(char);
    if (stemVal) {
      const tg = calculateTenGod(dayMasterChar, stemVal);
      if (tenGodsCounts[tg] !== undefined) {
        tenGodsCounts[tg] += 10;
      } else if (tg.includes('Friend')) {
        tenGodsCounts['Friend (Bi Jian)'] += 10;
      }
    }
  });

  const tenGods = Object.entries(tenGodsCounts).map(([name, val]) => ({
    name,
    strength: val,
  }));

  const genderInt = gender === 'male' ? 1 : 0;
  const yun = eightChar.getYun(genderInt);
  const daYunArr = yun.getDaYun();

  const luckCycles = daYunArr.slice(1, 9).map((dy) => {
    const startAge = dy.getStartAge();
    const endAge = dy.getEndAge();
    const startYear = typeof dy.getStartYear === 'function' ? dy.getStartYear() : null;
    const endYear = typeof dy.getEndYear === 'function' ? dy.getEndYear() : null;
    const ganZhi = dy.getGanZhi();
    const gan = ganZhi.substring(0, 1);
    const zhi = ganZhi.substring(1, 2);
    const stemInfo = STEMS_MAP[gan] || { name: gan };
    const zhiInfo = BRANCHES_MAP[zhi] || { name: zhi };

    return {
      range: `${startAge}-${endAge}`,
      stem: stemInfo.name,
      branch: zhiInfo.name,
      startYear,
      endYear,
    };
  });

  return { pillars, fiveElements: counts, fiveElementsPercent, tenGods, luckCycles };
};

export const hasFullBaziResult = (result) => {
  if (!result || typeof result !== 'object') return false;
  if (!result.pillars || !result.fiveElements) return false;
  if (!result.tenGods || !result.luckCycles) return false;
  return true;
};

export const getBaziCalculation = async (data, { bypassCache = false } = {}) => {
  const cacheKey = buildBaziCacheKey(data);
  if (!bypassCache && cacheKey) {
    const cached = await getCachedBaziCalculationAsync(cacheKey);
    if (cached && hasFullBaziResult(cached)) return cached;
  }
  const result = performCalculation(data);
  if (cacheKey) setBaziCacheEntry(cacheKey, result);
  return result;
};

export const getBaziCalculationWithMeta = async (data, { bypassCache = false } = {}) => {
  const cacheKey = buildBaziCacheKey(data);
  if (!bypassCache && cacheKey) {
    const cached = await getCachedBaziCalculationAsync(cacheKey);
    if (cached && hasFullBaziResult(cached)) {
      return { result: cached, cacheHit: true };
    }
  }
  const result = performCalculation(data);
  if (cacheKey) setBaziCacheEntry(cacheKey, result);
  return { result, cacheHit: false };
};

export const buildTrueSolarMeta = (payload, timeMeta) => {
  if (!payload) return null;
  const location = resolveLocationCoordinates(payload.birthLocation);
  if (!location) {
    return {
      applied: false,
      location: null,
      correctionMinutes: null,
      corrected: null,
      correctedIso: null,
    };
  }
  const resolvedOffset = Number.isFinite(timeMeta?.timezoneOffsetMinutes)
    ? timeMeta.timezoneOffsetMinutes
    : parseTimezoneOffsetMinutes(payload.timezoneOffsetMinutes ?? payload.timezone);
  const trueSolar = computeTrueSolarTime({
    birthYear: payload.birthYear,
    birthMonth: payload.birthMonth,
    birthDay: payload.birthDay,
    birthHour: payload.birthHour,
    birthMinute: payload.birthMinute,
    timezoneOffsetMinutes: resolvedOffset,
    longitude: location.longitude,
  });
  if (!trueSolar) {
    return {
      applied: false,
      location,
      correctionMinutes: null,
      corrected: null,
      correctedIso: null,
    };
  }
  return {
    applied: true,
    location,
    correctionMinutes: trueSolar.correctionMinutes,
    corrected: trueSolar.corrected,
    correctedIso: trueSolar.correctedDate.toISOString(),
  };
};

export const trueSolarMeta = buildTrueSolarMeta;

export const resolveBaziCalculationInput = (payload) => {
  const timeMeta = buildBirthTimeMeta(payload);
  const trueSolarMetaValue = buildTrueSolarMeta(payload, timeMeta);
  if (trueSolarMetaValue?.applied && trueSolarMetaValue?.corrected) {
    const { year, month, day, hour } = trueSolarMetaValue.corrected;
    return {
      calculationPayload: {
        ...payload,
        birthYear: year,
        birthMonth: month,
        birthDay: day,
        birthHour: hour,
      },
      timeMeta,
      trueSolarMeta: trueSolarMetaValue,
    };
  }
  return { calculationPayload: payload, timeMeta, trueSolarMeta: trueSolarMetaValue };
};

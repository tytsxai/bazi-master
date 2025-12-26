import { Solar } from 'lunar-javascript';
import { normalizeLocationKey, resolveLocationCoordinates, computeTrueSolarTime, listKnownLocations } from './solarTime.service.js';

export { normalizeLocationKey, resolveLocationCoordinates, computeTrueSolarTime, listKnownLocations };

import {
  buildBaziCacheKey,
  getCachedBaziCalculationAsync,
  setBaziCacheEntry,
  primeBaziCalculationCache,
  normalizeBaziResult
} from './cache.service.js';
import { parseTimezoneOffsetMinutes, formatTimezoneOffset } from '../utils/timezone.js';

// Pinyin and Element mappings for Stems (TianGan)
export const STEMS_MAP = {
  '甲': { name: 'Jia', element: 'Wood', polarity: '+' },
  '乙': { name: 'Yi', element: 'Wood', polarity: '-' },
  '丙': { name: 'Bing', element: 'Fire', polarity: '+' },
  '丁': { name: 'Ding', element: 'Fire', polarity: '-' },
  '戊': { name: 'Wu', element: 'Earth', polarity: '+' },
  '己': { name: 'Ji', element: 'Earth', polarity: '-' },
  '庚': { name: 'Geng', element: 'Metal', polarity: '+' },
  '辛': { name: 'Xin', element: 'Metal', polarity: '-' },
  '壬': { name: 'Ren', element: 'Water', polarity: '+' },
  '癸': { name: 'Gui', element: 'Water', polarity: '-' },
};

// Pinyin and Element mappings for Branches (DiZhi)
export const BRANCHES_MAP = {
  '子': { name: 'Zi', element: 'Water', polarity: '+' },
  '丑': { name: 'Chou', element: 'Earth', polarity: '-' },
  '寅': { name: 'Yin', element: 'Wood', polarity: '+' },
  '卯': { name: 'Mao', element: 'Wood', polarity: '-' },
  '辰': { name: 'Chen', element: 'Earth', polarity: '+' },
  '巳': { name: 'Si', element: 'Fire', polarity: '-' },
  '午': { name: 'Wu', element: 'Fire', polarity: '+' },
  '未': { name: 'Wei', element: 'Earth', polarity: '-' },
  '申': { name: 'Shen', element: 'Metal', polarity: '+' },
  '酉': { name: 'You', element: 'Metal', polarity: '-' },
  '戌': { name: 'Xu', element: 'Earth', polarity: '+' },
  '亥': { name: 'Hai', element: 'Water', polarity: '-' },
};

export const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

const coerceInt = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
};

const parseJsonField = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export function getElementRelation(me, other) {
  if (me === other) return 'Same';
  const meIdx = ELEMENTS.indexOf(me);
  const otherIdx = ELEMENTS.indexOf(other);
  if (meIdx === -1 || otherIdx === -1) return 'Unknown';
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
    charBranch: zhiChar
  };
}

export const performCalculation = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = data;
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour || 0, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const yearPillar = buildPillar(eightChar.getYearGan(), eightChar.getYearZhi());
  const monthPillar = buildPillar(eightChar.getMonthGan(), eightChar.getMonthZhi());
  const dayPillar = buildPillar(eightChar.getDayGan(), eightChar.getDayZhi());
  const hourPillar = buildPillar(eightChar.getTimeGan(), eightChar.getTimeZhi());

  const pillars = { year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar };

  const counts = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  const addCount = (el) => { if (counts[el] !== undefined) counts[el]++; };
  [yearPillar, monthPillar, dayPillar, hourPillar].forEach(p => {
    addCount(p.elementStem);
    addCount(p.elementBranch);
  });
  const totalElements = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const fiveElementsPercent = ELEMENTS.reduce((acc, element) => {
    acc[element] = totalElements ? Math.round((counts[element] / totalElements) * 100) : 0;
    return acc;
  }, {});

  const dayMasterChar = eightChar.getDayGan();
  const tenGodsCounts = {};
  const allTenGodsTypes = [
    'Friend (Bi Jian)', 'Rob Wealth (Jie Cai)', 'Eating God (Shi Shen)', 'Hurting Officer (Shang Guan)',
    'Indirect Wealth (Pian Cai)', 'Direct Wealth (Zheng Cai)', 'Seven Killings (Qi Sha)', 'Direct Officer (Zheng Guan)',
    'Indirect Resource (Pian Yin)', 'Direct Resource (Zheng Yin)'
  ];
  allTenGodsTypes.forEach(t => tenGodsCounts[t] = 0);

  const getCharStemEquivalent = (char) => {
    if (STEMS_MAP[char]) return char;
    const branchToMainQi = {
      '子': '癸', '丑': '己', '寅': '甲', '卯': '乙', '辰': '戊', '巳': '丙',
      '午': '丁', '未': '己', '申': '庚', '酉': '辛', '戌': '戊', '亥': '壬'
    };
    return branchToMainQi[char];
  };

  [yearPillar.charStem, yearPillar.charBranch, monthPillar.charStem, monthPillar.charBranch,
  dayPillar.charBranch, hourPillar.charStem, hourPillar.charBranch].forEach(char => {
    const stemVal = getCharStemEquivalent(char);
    if (stemVal) {
      const tg = calculateTenGod(dayMasterChar, stemVal);
      if (tenGodsCounts[tg] !== undefined) tenGodsCounts[tg] += 10;
      else if (tg.includes('Friend')) tenGodsCounts['Friend (Bi Jian)'] += 10;
    }
  });

  const tenGods = Object.entries(tenGodsCounts).map(([name, val]) => ({ name, strength: val }));

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
    return {
      range: `${startAge}-${endAge}`,
      stem: STEMS_MAP[gan]?.name || gan,
      branch: BRANCHES_MAP[zhi]?.name || zhi,
      startYear,
      endYear
    };
  });

  return { pillars, fiveElements: counts, fiveElementsPercent, tenGods, luckCycles };
};

export const hasFullBaziResult = (result) => {
  if (!result || typeof result !== 'object') return false;
  return !!(result.pillars && result.fiveElements && result.tenGods && result.luckCycles);
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

export const buildImportRecord = async (raw, userId) => {
  if (!raw || typeof raw !== 'object') return null;
  const birthYear = coerceInt(raw.birthYear);
  const birthMonth = coerceInt(raw.birthMonth);
  const birthDay = coerceInt(raw.birthDay);
  const birthHour = coerceInt(raw.birthHour);
  const gender = typeof raw.gender === 'string' ? raw.gender.trim() : '';
  if (!birthYear || !birthMonth || !birthDay || birthHour === null || !gender) return null;

  let pillars = parseJsonField(raw.pillars);
  let fiveElements = parseJsonField(raw.fiveElements);
  let tenGods = parseJsonField(raw.tenGods);
  let luckCycles = parseJsonField(raw.luckCycles);

  if (!pillars || !fiveElements) {
    const computed = await getBaziCalculation({ birthYear, birthMonth, birthDay, birthHour, gender });
    if (!pillars) pillars = computed.pillars;
    if (!fiveElements) fiveElements = computed.fiveElements;
    if (!tenGods) tenGods = computed.tenGods;
    if (!luckCycles) luckCycles = computed.luckCycles;
  }
  primeBaziCalculationCache(
    { birthYear, birthMonth, birthDay, birthHour, gender },
    { pillars, fiveElements, tenGods, luckCycles }
  );

  const createdAtRaw = raw.createdAt ? new Date(raw.createdAt) : null;
  const createdAt = createdAtRaw && !Number.isNaN(createdAtRaw.getTime()) ? createdAtRaw : null;
  const updatedAtRaw = raw.updatedAt ? new Date(raw.updatedAt) : null;
  const updatedAt = updatedAtRaw && !Number.isNaN(updatedAtRaw.getTime()) ? updatedAtRaw : null;

  const timezoneOffset = parseTimezoneOffsetMinutes(raw.timezoneOffsetMinutes);
  const timezoneFallback = Number.isFinite(timezoneOffset) ? formatTimezoneOffset(timezoneOffset) : null;

  return {
    userId,
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
    birthLocation: typeof raw.birthLocation === 'string' ? raw.birthLocation : null,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : timezoneFallback,
    pillars: JSON.stringify(pillars),
    fiveElements: JSON.stringify(fiveElements),
    tenGods: JSON.stringify(tenGods),
    luckCycles: JSON.stringify(luckCycles),
    createdAt,
    updatedAt,
  };
};

export const calculateDailyPillars = (date = new Date()) => {
  const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  // Create simple pillar objects for the day
  const dayPillar = buildPillar(eightChar.getDayGan(), eightChar.getDayZhi());

  return {
    date: date.toISOString().split('T')[0],
    stem: dayPillar.stem,
    branch: dayPillar.branch,
    elementStem: dayPillar.elementStem,
    elementBranch: dayPillar.elementBranch,
    charStem: dayPillar.charStem,
    charBranch: dayPillar.charBranch
  };
};

export const calculateDailyScore = (userChart, dailyPillars) => {
  if (!userChart || !dailyPillars) return { score: 50, advice: 'Stay balanced.' };

  let score = 60; // Base score
  let advice = [];

  const dmElement = userChart.pillars.day.elementStem;
  const dayElement = dailyPillars.elementStem;

  // Element Relationship
  const relation = getElementRelation(dayElement, dmElement); // Day acts on Me

  if (relation === 'Generates') {
    score += 15;
    advice.push('Today supports you securely. Good for planning.');
  } else if (relation === 'Same') {
    score += 10;
    advice.push('Social energy is high. Connect with friends.');
  } else if (relation === 'Controls') {
    score -= 10;
    advice.push('Pressure might be high. Stay disciplined.');
  } else if (relation === 'ControlledBy') {
    score += 5; // Wealth element often
    advice.push('Opportunity for gain, but requires effort.');
  } else {
    // GeneratedBy (I generate output)
    score += 5;
    advice.push('Good day for creative expression.');
  }

  // Simple Branch Clash check (Zi-Wu, etc.) - Simplified list
  const clashes = {
    'Zi': 'Wu', 'Wu': 'Zi',
    'Chou': 'Wei', 'Wei': 'Chou',
    'Yin': 'Shen', 'Shen': 'Yin',
    'Mao': 'You', 'You': 'Mao',
    'Chen': 'Xu', 'Xu': 'Chen',
    'Si': 'Hai', 'Hai': 'Si'
  };

  const userBranch = userChart.pillars.day.branch;
  const dayBranch = dailyPillars.branch;

  if (clashes[userBranch] === dayBranch) {
    score -= 20;
    advice.push('Watch out for conflicts in personal life.');
  }

  // Normalize
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    advice: advice.join(' '),
    element: dayElement
  };
};

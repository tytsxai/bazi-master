import { Solar } from 'lunar-javascript';

import { BRANCHES_MAP } from '../constants/stems.js';
import {
  ZIWEI_BRANCH_ORDER,
  ZIWEI_MONTH_BRANCH_ORDER,
  ZIWEI_PALACES,
  ZIWEI_MAJOR_STARS,
  ZIWEI_MINOR_STARS,
  ZIWEI_SIHUA_BY_STEM,
} from '../constants/ziwei.js';

const normalizeIndex = (value, modulo = 12) => ((value % modulo) + modulo) % modulo;

const getTimeBranchIndex = (birthHour) => {
  const hour = Number(birthHour);
  if (!Number.isFinite(hour)) return 0;
  return Math.floor((hour + 1) / 2) % 12;
};

const buildZiweiPalaces = (mingIndex) => {
  const palaces = ZIWEI_BRANCH_ORDER.map((branch, index) => ({
    index,
    branch: {
      key: branch,
      name: BRANCHES_MAP[branch]?.name || branch,
      element: BRANCHES_MAP[branch]?.element || 'Unknown',
      polarity: BRANCHES_MAP[branch]?.polarity || null,
    },
    palace: null,
    stars: { major: [], minor: [] },
    transformations: [],
  }));

  ZIWEI_PALACES.forEach((palace, offset) => {
    const index = normalizeIndex(mingIndex + offset);
    palaces[index].palace = palace;
  });

  return palaces;
};

export const calculateZiweiChart = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour } = data;
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour || 0, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const lunarMonth = lunar.getMonth();
  const lunarDay = lunar.getDay();
  const lunarYear = lunar.getYear();
  const isLeapMonth = typeof lunar.isLeap === 'function' ? lunar.isLeap() : Boolean(lunar.isLeap);

  const monthBranch = ZIWEI_MONTH_BRANCH_ORDER[normalizeIndex(lunarMonth - 1)];
  const monthBranchIndex = ZIWEI_BRANCH_ORDER.indexOf(monthBranch);
  const timeBranchIndex = getTimeBranchIndex(birthHour);

  const mingIndex = normalizeIndex(monthBranchIndex - timeBranchIndex);
  const shenIndex = normalizeIndex(monthBranchIndex + timeBranchIndex);

  const ziweiIndex = normalizeIndex(monthBranchIndex + (lunarDay - 1));
  const tianfuIndex = normalizeIndex(ziweiIndex + 6);

  const palaces = buildZiweiPalaces(mingIndex);

  const transformMap = ZIWEI_SIHUA_BY_STEM[eightChar.getYearGan()] || {};
  const transformByStarKey = Object.values(transformMap).reduce((acc, key) => {
    if (key) acc[key] = acc[key] || [];
    return acc;
  }, {});
  Object.entries(transformMap).forEach(([type, key]) => {
    if (!key) return;
    if (!transformByStarKey[key]) transformByStarKey[key] = [];
    transformByStarKey[key].push(type);
  });

  const addStar = (index, star, group) => {
    if (!star) return;
    const target = palaces[index];
    if (!target) return;
    const transforms = transformByStarKey[star.key] || [];
    const entry = transforms.length ? { ...star, transforms } : { ...star };
    target.stars[group].push(entry);
    if (transforms.length) {
      transforms.forEach((type) => {
        target.transformations.push({
          type,
          starKey: star.key,
          starName: star.name,
          starCn: star.cn,
        });
      });
    }
  };

  const ziweiGroup = [
    { star: ZIWEI_MAJOR_STARS.ziwei, offset: 0 },
    { star: ZIWEI_MAJOR_STARS.tianji, offset: 1 },
    { star: ZIWEI_MAJOR_STARS.taiyang, offset: 3 },
    { star: ZIWEI_MAJOR_STARS.wuqu, offset: 4 },
    { star: ZIWEI_MAJOR_STARS.tiantong, offset: 5 },
    { star: ZIWEI_MAJOR_STARS.lianzhen, offset: 6 },
  ];

  const tianfuGroup = [
    { star: ZIWEI_MAJOR_STARS.tianfu, offset: 0 },
    { star: ZIWEI_MAJOR_STARS.taiyin, offset: 1 },
    { star: ZIWEI_MAJOR_STARS.tanlang, offset: 2 },
    { star: ZIWEI_MAJOR_STARS.jumen, offset: 3 },
    { star: ZIWEI_MAJOR_STARS.tianxiang, offset: 4 },
    { star: ZIWEI_MAJOR_STARS.tianliang, offset: 5 },
    { star: ZIWEI_MAJOR_STARS.qisha, offset: 6 },
    { star: ZIWEI_MAJOR_STARS.pojun, offset: 7 },
  ];

  ziweiGroup.forEach(({ star, offset }) =>
    addStar(normalizeIndex(ziweiIndex + offset), star, 'major')
  );
  tianfuGroup.forEach(({ star, offset }) =>
    addStar(normalizeIndex(tianfuIndex + offset), star, 'major')
  );

  const minorBase = normalizeIndex(lunarDay + timeBranchIndex);
  const minorGroup = [
    { star: ZIWEI_MINOR_STARS.wenchang, offset: 0 },
    { star: ZIWEI_MINOR_STARS.wenqu, offset: 4 },
    { star: ZIWEI_MINOR_STARS.zuofu, offset: 6 },
    { star: ZIWEI_MINOR_STARS.youbi, offset: 10 },
    { star: ZIWEI_MINOR_STARS.huoxing, offset: 2 },
    { star: ZIWEI_MINOR_STARS.lingxing, offset: 8 },
    { star: ZIWEI_MINOR_STARS.tiankui, offset: 1 },
    { star: ZIWEI_MINOR_STARS.tianyue, offset: 7 },
  ];
  minorGroup.forEach(({ star, offset }) =>
    addStar(normalizeIndex(minorBase + offset), star, 'minor')
  );

  const transformations = Object.entries(transformMap).map(([type, starKey]) => {
    const starDef = ZIWEI_MAJOR_STARS[starKey] || ZIWEI_MINOR_STARS[starKey] || { key: starKey };
    return {
      type,
      starKey,
      starName: starDef.name || starKey,
      starCn: starDef.cn || null,
    };
  });

  return {
    lunar: {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap: isLeapMonth,
      yearStem: eightChar.getYearGan(),
      yearBranch: eightChar.getYearZhi(),
      monthStem: eightChar.getMonthGan(),
      monthBranch: eightChar.getMonthZhi(),
      dayStem: eightChar.getDayGan(),
      dayBranch: eightChar.getDayZhi(),
      timeStem: eightChar.getTimeGan(),
      timeBranch: eightChar.getTimeZhi(),
    },
    mingPalace: {
      index: mingIndex,
      branch: palaces[mingIndex]?.branch,
      palace: palaces[mingIndex]?.palace,
    },
    shenPalace: {
      index: shenIndex,
      branch: palaces[shenIndex]?.branch,
      palace: palaces[shenIndex]?.palace,
    },
    fourTransformations: transformations,
    palaces,
  };
};

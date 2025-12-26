import {
  ELEMENT_COMPATIBILITY,
  MODALITY_COMPATIBILITY,
  ZODIAC_PERIODS
} from '../constants/zodiac.js';

export { ZODIAC_PERIODS };

export const ZODIAC_ORDER = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
];

export const normalizeAngle = (deg) => ((deg % 360) + 360) % 360;
export const degToRad = (deg) => (deg * Math.PI) / 180;
export const radToDeg = (rad) => (rad * 180) / Math.PI;

export const calculateRisingSign = ({
  birthYear,
  birthMonth,
  birthDay,
  birthHour,
  birthMinute,
  latitude,
  longitude,
  timezoneOffsetMinutes
}) => {
  const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
  const utcMillis = Date.UTC(
    birthYear,
    birthMonth - 1,
    birthDay,
    birthHour,
    birthMinute || 0,
    0
  ) - offsetMinutes * 60 * 1000;

  const jd = utcMillis / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const gmst = normalizeAngle(
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000
  );
  const lst = normalizeAngle(gmst + longitude);

  const theta = degToRad(lst);
  const epsilon = degToRad(23.439291 - 0.0130042 * t);
  const phi = degToRad(latitude);

  const ascRad = Math.atan2(
    -Math.cos(theta),
    Math.sin(theta) * Math.cos(epsilon) + Math.tan(phi) * Math.sin(epsilon)
  );
  const ascDeg = normalizeAngle(radToDeg(ascRad) + 180);
  const signIndex = Math.floor(ascDeg / 30);
  const signKey = ZODIAC_ORDER[signIndex] || 'aries';

  return {
    signKey,
    ascendant: {
      longitude: Number(ascDeg.toFixed(2)),
      localSiderealTime: Number((lst / 15).toFixed(2))
    }
  };
};

export const formatDateLabel = (date, options) =>
  date.toLocaleDateString('en-US', options);

export const getWeekRange = (date) => {
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDateLabel(start, { month: 'short', day: 'numeric' })} - ${formatDateLabel(end, { month: 'short', day: 'numeric' })}`;
};

export const normalizeSign = (raw) => raw?.toString().trim().toLowerCase();

export const sanitizeQueryParam = (raw) => {
  const normalized = normalizeSign(raw);
  if (!normalized) return null;
  if (!/^[a-z]+$/.test(normalized)) return null;
  return normalized;
};

export const buildHoroscope = (sign, period) => {
  const now = new Date();
  const range =
    period === 'daily'
      ? formatDateLabel(now, { month: 'short', day: 'numeric', year: 'numeric' })
      : period === 'weekly'
        ? getWeekRange(now)
        : formatDateLabel(now, { month: 'long', year: 'numeric' });

  const focusMap = {
    daily: 'short, intentional steps',
    weekly: 'strategic momentum',
    monthly: 'long-term alignment'
  };

  const energyMap = {
    Fire: 'spark and momentum',
    Earth: 'steadiness and structure',
    Air: 'clarity and connection',
    Water: 'intuition and depth'
  };

  return {
    overview: `Your ${sign.element.toLowerCase()} energy brings ${energyMap[sign.element]} today. Lead with ${sign.keywords[0]} choices and let ${focusMap[period]} guide your pace.`,
    love: `In relationships, lean into ${sign.keywords[1]} expression. A clear invitation or gentle check-in strengthens bonds.`,
    career: `Work flows when you apply your ${sign.strengths[1]} instincts. Prioritize the task that unlocks the rest.`,
    wellness: `Balance your drive with grounding rituals. Stretch, hydrate, and carve out a quiet reset.`,
    lucky: {
      colors: sign.luckyColors,
      numbers: sign.luckyNumbers
    },
    mantra: `I honor my ${sign.element.toLowerCase()} nature and move with ${sign.keywords[2]} confidence.`
  };
};

export const clampScore = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

export const compatibilityLevel = (score) => {
  if (score >= 80) return 'Cosmic Spark';
  if (score >= 65) return 'Harmonious Flow';
  if (score >= 50) return 'Balanced Orbit';
  if (score >= 35) return 'Learning Curve';
  return 'High Contrast';
};

const buildCompatibilitySummary = (primary, secondary, level) =>
  `${level} between ${primary.name} and ${secondary.name}. ${primary.element} energy meets ${secondary.element} energy with ${primary.modality.toLowerCase()} and ${secondary.modality.toLowerCase()} rhythms.`;

export const buildZodiacCompatibility = (primary, secondary) => {
  let score = 50;
  const highlights = [];
  const breakdown = {};

  if (primary.name === secondary.name) {
    score += 6;
    highlights.push('Same-sign pairing amplifies shared traits.');
  }

  const elementInsight = ELEMENT_COMPATIBILITY?.[primary.element]?.[secondary.element];
  if (elementInsight) {
    score += elementInsight.score;
    breakdown.element = {
      score: elementInsight.score,
      note: elementInsight.note
    };
    highlights.push(elementInsight.note);
  }

  const modalityInsight = MODALITY_COMPATIBILITY?.[primary.modality]?.[secondary.modality];
  if (modalityInsight) {
    score += modalityInsight.score;
    breakdown.modality = {
      score: modalityInsight.score,
      note: modalityInsight.note
    };
    highlights.push(modalityInsight.note);
  }

  const mutualMatch =
    primary.compatibility.includes(secondary.name) && secondary.compatibility.includes(primary.name);
  const oneWayMatch =
    !mutualMatch &&
    (primary.compatibility.includes(secondary.name) || secondary.compatibility.includes(primary.name));
  if (mutualMatch) {
    score += 12;
    breakdown.affinity = {
      score: 12,
      note: 'Mutual favorite pairing boosts natural chemistry.'
    };
    highlights.push('Mutual favorite pairing boosts natural chemistry.');
  } else if (oneWayMatch) {
    score += 6;
    breakdown.affinity = {
      score: 6,
      note: 'One sign naturally gravitates toward the other.'
    };
    highlights.push('One sign naturally gravitates toward the other.');
  }

  if (primary.rulingPlanet === secondary.rulingPlanet) {
    score += 4;
    breakdown.rulingPlanet = {
      score: 4,
      note: `Shared ruling planet (${primary.rulingPlanet}) aligns motivations.`
    };
    highlights.push(`Shared ruling planet (${primary.rulingPlanet}) aligns motivations.`);
  }

  score = clampScore(score);
  const level = compatibilityLevel(score);

  return {
    score,
    level,
    summary: buildCompatibilitySummary(primary, secondary, level),
    highlights,
    breakdown
  };
};

// All exports are handled individually above

import { TRIGRAMS, hexagramByTrigrams, hexagramByLines } from './data/ichingHexagrams.js';

const normalizeNumber = (value, modulo) => {
  const safe = Math.abs(Number(value));
  if (!Number.isFinite(safe)) return null;
  const remainder = safe % modulo;
  return remainder === 0 ? modulo : remainder;
};

const pickTrigram = (value) => {
  const index = normalizeNumber(value, 8);
  if (!index) return null;
  return TRIGRAMS[index - 1];
};

const buildHexagram = (upper, lower) => {
  if (!upper || !lower) return null;
  return hexagramByTrigrams.get(`${upper.id}-${lower.id}`) || null;
};

const applyChangingLines = (hexagram, changingLines = []) => {
  if (!hexagram || !changingLines.length) return hexagram;
  const nextLines = [...hexagram.lines];
  changingLines.forEach((line) => {
    const index = Math.min(Math.max(line, 1), 6) - 1;
    nextLines[index] = nextLines[index] ? 0 : 1;
  });
  return hexagramByLines.get(nextLines.join('')) || { ...hexagram, lines: nextLines };
};

const deriveChangingLinesFromNumbers = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length !== 3) return [];
  // Traditional Plum Blossom method: sum of numbers modulo 6 for changing line
  const sum = numbers.reduce((total, value) => total + Number(value), 0);
  const changingLine = normalizeNumber(sum, 6);
  return changingLine ? [changingLine] : [];
};

const deriveChangingLinesFromTimeContext = (timeContext) => {
  if (!timeContext || typeof timeContext !== 'object') return [];
  const year = Number(timeContext.year);
  const month = Number(timeContext.month);
  const day = Number(timeContext.day);
  const hour = Number(timeContext.hour);
  const minute = Number.isFinite(Number(timeContext.minute)) ? Number(timeContext.minute) : 0;
  if (![year, month, day, hour, minute].every(Number.isFinite)) return [];

  const first = normalizeNumber(year + month + day, 6);
  const second = normalizeNumber(hour * 100 + minute, 6);
  const unique = new Set([first, second].filter(Boolean));
  return Array.from(unique).sort((a, b) => a - b);
};

const getDetailedLines = (hexagram, changingLines = []) => {
  if (!hexagram?.lines) return [];
  return hexagram.lines.map((bit, idx) => {
    const position = idx + 1;
    const isChanging = changingLines.includes(position);
    // 1 = Yang, 0 = Yin
    let status = '';
    if (bit === 1) {
      status = isChanging ? 'Old Yang (Moving)' : 'Young Yang (Stable)';
    } else {
      status = isChanging ? 'Old Yin (Moving)' : 'Young Yin (Stable)';
    }
    return { position, bit, isChanging, status };
  });
};

export {
  normalizeNumber,
  pickTrigram,
  buildHexagram,
  applyChangingLines,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
  getDetailedLines,
};

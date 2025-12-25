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
  const sum = numbers.reduce((total, value) => total + Number(value), 0);
  const changingLine = normalizeNumber(sum, 6);
  return changingLine ? [changingLine] : [];
};

const deriveChangingLinesFromTimeContext = (timeContext) => {
  if (!timeContext) return [];
  const baseSum = timeContext.year + timeContext.month + timeContext.day;
  const timeSum = timeContext.hour + timeContext.minute;
  const totalSum = baseSum + timeSum;
  const candidates = [
    normalizeNumber(baseSum, 6),
    normalizeNumber(timeSum, 6),
    normalizeNumber(totalSum, 6),
  ].filter(Boolean);
  return [...new Set(candidates)].sort((a, b) => a - b);
};

export {
  normalizeNumber,
  pickTrigram,
  buildHexagram,
  applyChangingLines,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
};

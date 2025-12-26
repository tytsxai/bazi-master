// Date utility functions for Bazi calculations

const coerceInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
};

export const getTodayParts = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};

export const getDaysInMonth = (year, month) => {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 31;
  return new Date(year, month, 0).getDate();
};

export const getDateInputLimits = (data) => {
  const today = getTodayParts();
  const year = coerceInt(data.birthYear);
  const month = coerceInt(data.birthMonth);
  const maxYear = today.year;
  const maxMonth = year === today.year ? today.month : 12;
  const daysInMonth = getDaysInMonth(year ?? today.year, month ?? 1);
  const maxDay =
    year === today.year && month === today.month ? Math.min(daysInMonth, today.day) : daysInMonth;

  return {
    birthYear: { min: 1, max: maxYear },
    birthMonth: { min: 1, max: maxMonth },
    birthDay: { min: 1, max: maxDay },
  };
};

export const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

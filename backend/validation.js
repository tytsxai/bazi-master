const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;

const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
};

const validateBaziInput = (raw) => {
  const birthYear = Number(raw?.birthYear);
  const birthMonth = Number(raw?.birthMonth);
  const birthDay = Number(raw?.birthDay);
  const birthHour = Number(raw?.birthHour);
  const genderRaw = raw?.gender;
  const gender = typeof genderRaw === 'string' ? genderRaw.trim() : '';
  const birthLocationRaw = raw?.birthLocation;
  const timezoneRaw = raw?.timezone;
  if (isWhitespaceOnly(genderRaw) || isWhitespaceOnly(birthLocationRaw) || isWhitespaceOnly(timezoneRaw)) {
    return { ok: false, payload: null, reason: 'whitespace' };
  }
  const birthLocation = typeof birthLocationRaw === 'string' ? birthLocationRaw.trim() : birthLocationRaw;
  const timezone = typeof timezoneRaw === 'string' ? timezoneRaw.trim() : timezoneRaw;

  if (
    !Number.isInteger(birthYear)
    || birthYear < 1
    || birthYear > 9999
    || !Number.isInteger(birthMonth)
    || birthMonth < 1
    || birthMonth > 12
    || !Number.isInteger(birthDay)
    || birthDay < 1
    || birthDay > 31
    || !Number.isInteger(birthHour)
    || birthHour < 0
    || birthHour > 23
    || !gender
    || !isValidCalendarDate(birthYear, birthMonth, birthDay)
  ) {
    return { ok: false, payload: null, reason: 'invalid' };
  }

  return {
    ok: true,
    payload: {
      ...raw,
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
      birthLocation,
      timezone,
    },
  };
};

export { isWhitespaceOnly, isValidCalendarDate, validateBaziInput };

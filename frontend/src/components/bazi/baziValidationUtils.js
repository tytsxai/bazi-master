import { isValidCalendarDate, getTodayParts } from './baziDateUtils.js';
import { isWhitespaceOnly } from './baziFormUtils.js';

// Validation utilities for Bazi forms

export const getFieldErrors = (data, t) => {
  const nextErrors = {};
  const year = Number(data.birthYear);
  const month = Number(data.birthMonth);
  const day = Number(data.birthDay);
  const hour = Number(data.birthHour);
  const today = getTodayParts();

  if (!data.birthYear) {
    nextErrors.birthYear = t('bazi.errors.yearRequired');
  } else if (!Number.isInteger(year) || year < 1 || year > today.year) {
    nextErrors.birthYear = t('bazi.errors.yearInvalid');
  }

  if (!data.birthMonth) {
    nextErrors.birthMonth = t('bazi.errors.monthRequired');
  } else if (!Number.isInteger(month) || month < 1 || month > 12) {
    nextErrors.birthMonth = t('bazi.errors.monthInvalid');
  }

  if (!data.birthDay) {
    nextErrors.birthDay = t('bazi.errors.dayRequired');
  } else if (!Number.isInteger(day) || day < 1 || day > 31) {
    nextErrors.birthDay = t('bazi.errors.dayInvalid');
  } else if (
    !nextErrors.birthYear &&
    !nextErrors.birthMonth &&
    !isValidCalendarDate(year, month, day)
  ) {
    nextErrors.birthDay = t('bazi.errors.dateInvalid');
  } else if (!nextErrors.birthYear && !nextErrors.birthMonth) {
    const isFuture =
      year > today.year ||
      (year === today.year && month > today.month) ||
      (year === today.year && month === today.month && day > today.day);
    if (isFuture) {
      nextErrors.birthDay = t('bazi.errors.futureDate');
    }
  }

  if (data.birthHour === '') {
    nextErrors.birthHour = t('bazi.errors.hourRequired');
  } else if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    nextErrors.birthHour = t('bazi.errors.hourInvalid');
  }

  if (!data.gender) {
    nextErrors.gender = t('bazi.errors.genderRequired');
  }

  if (isWhitespaceOnly(data.birthLocation)) {
    nextErrors.birthLocation = t('bazi.errors.locationWhitespace');
  }

  if (isWhitespaceOnly(data.timezone)) {
    nextErrors.timezone = t('bazi.errors.timezoneWhitespace');
  }

  return nextErrors;
};

export const hasValidationErrors = (errors) => {
  return Object.keys(errors).length > 0;
};

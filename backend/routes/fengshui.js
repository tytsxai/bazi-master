import { logger } from '../config/logger.js';
import express from 'express';

import { buildBazhaiChart, buildAlmanac, buildNameGrids } from '../services/fengshui.service.js';

const router = express.Router();

const fail = (res, error) => res.status(400).json({ error });

router.post('/bazhai', (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, birthMinute, gender } = req.body || {};
  const year = Number(birthYear);
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    return fail(res, 'birthYear is required.');
  }
  if (!gender) return fail(res, 'gender is required.');
  if (birthHour !== undefined && birthHour !== null) {
    const hour = Number(birthHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return fail(res, 'birthHour must be an integer between 0 and 23.');
    }
  }
  if (birthMinute !== undefined && birthMinute !== null) {
    const minute = Number(birthMinute);
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      return fail(res, 'birthMinute must be an integer between 0 and 59.');
    }
  }

  try {
    // 立春当天要靠时刻定年，给了 birthHour 命卦才是确定的；
    // 不给时只能按当日零点算，响应里的 lifeTrigram.precision 会标成 day
    const chart = buildBazhaiChart({
      birthYear: year,
      birthMonth,
      birthDay,
      birthHour,
      birthMinute,
      gender,
    });
    if (!chart) return fail(res, 'Unable to resolve life trigram.');
    return res.json(chart);
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Bazhai failed');
    return res.status(500).json({ error: 'Calculation error' });
  }
});

router.get('/almanac', (req, res) => {
  const now = new Date();
  const y = Number.isInteger(Number(req.query.year)) ? Number(req.query.year) : now.getFullYear();
  const m = Number.isInteger(Number(req.query.month))
    ? Number(req.query.month)
    : now.getMonth() + 1;
  const d = Number.isInteger(Number(req.query.day)) ? Number(req.query.day) : now.getDate();

  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) {
    return fail(res, 'Invalid date.');
  }

  try {
    const almanac = buildAlmanac({ year: y, month: m, day: d });
    if (!almanac) return fail(res, 'Invalid date.');
    return res.json(almanac);
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Almanac failed');
    return res.status(500).json({ error: 'Calculation error' });
  }
});

router.post('/name', (req, res) => {
  const { surnameStrokes, givenNameStrokes } = req.body || {};
  if (!Array.isArray(surnameStrokes) || !Array.isArray(givenNameStrokes)) {
    return fail(res, 'surnameStrokes and givenNameStrokes must be arrays of stroke counts.');
  }
  const valid = [...surnameStrokes, ...givenNameStrokes].every(
    (n) => Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) < 100
  );
  if (!valid) return fail(res, 'Stroke counts must be positive integers below 100.');

  try {
    const grids = buildNameGrids(surnameStrokes, givenNameStrokes);
    if (!grids) return fail(res, 'Provide at least one stroke count for surname and given name.');
    return res.json(grids);
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Name grids failed');
    return res.status(500).json({ error: 'Calculation error' });
  }
});

export default router;

import { logger } from '../config/logger.js';
import express from 'express';

import { buildBirthTimeMeta } from '../utils/timezone.js';
import { calculateZiweiChart } from '../services/ziwei.service.js';

const router = express.Router();

const parseZiweiPayload = (body) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = body || {};
  if (!birthYear || !birthMonth || !birthDay || birthHour === undefined || !gender) {
    return { ok: false, error: 'Missing required fields' };
  }

  const year = Number(birthYear);
  const month = Number(birthMonth);
  const day = Number(birthDay);
  const hour = Number(birthHour);

  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return { ok: false, error: 'Missing required fields' };
  }

  return {
    ok: true,
    payload: {
      ...body,
      birthYear: year,
      birthMonth: month,
      birthDay: day,
      birthHour: hour,
      gender: String(gender),
    },
  };
};

router.post('/calculate', (req, res) => {
  const parsed = parseZiweiPayload(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const result = calculateZiweiChart(parsed.payload);
    const timeMeta = buildBirthTimeMeta(parsed.payload);
    return res.json({ ...result, ...timeMeta });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Ziwei calculation failed');
    return res.status(500).json({ error: 'Calculation error' });
  }
});

export default router;

import express from 'express';

import { prisma } from '../config/prisma.js';
import { requireAuth } from '../middleware/auth.js';
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
    !Number.isInteger(year)
    || year < 1
    || year > 9999
    || !Number.isInteger(month)
    || month < 1
    || month > 12
    || !Number.isInteger(day)
    || day < 1
    || day > 31
    || !Number.isInteger(hour)
    || hour < 0
    || hour > 23
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

const parseJsonValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const serializeZiweiRecord = (record) => ({
  id: record.id,
  userId: record.userId,
  birthYear: record.birthYear,
  birthMonth: record.birthMonth,
  birthDay: record.birthDay,
  birthHour: record.birthHour,
  gender: record.gender,
  chart: parseJsonValue(record.chart),
  createdAt: record.createdAt,
});

router.post('/calculate', requireAuth, (req, res) => {
  const parsed = parseZiweiPayload(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const result = calculateZiweiChart(parsed.payload);
    const timeMeta = buildBirthTimeMeta(parsed.payload);
    return res.json({ ...result, ...timeMeta });
  } catch (error) {
    console.error('Ziwei calculation error:', error);
    return res.status(500).json({ error: 'Calculation error' });
  }
});

router.post('/history', requireAuth, async (req, res) => {
  const parsed = parseZiweiPayload(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const result = calculateZiweiChart(parsed.payload);
    const timeMeta = buildBirthTimeMeta(parsed.payload);
    const record = await prisma.ziweiRecord.create({
      data: {
        userId: req.user.id,
        birthYear: parsed.payload.birthYear,
        birthMonth: parsed.payload.birthMonth,
        birthDay: parsed.payload.birthDay,
        birthHour: parsed.payload.birthHour,
        gender: String(parsed.payload.gender),
        chart: JSON.stringify({ ...result, ...timeMeta }),
      },
    });
    return res.json({ record: serializeZiweiRecord(record) });
  } catch (error) {
    console.error('Failed to save Ziwei history:', error);
    return res.status(500).json({ error: 'Unable to save history' });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
  try {
    const records = await prisma.ziweiRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return res.json({ records: records.map(serializeZiweiRecord) });
  } catch (error) {
    console.error('Failed to load Ziwei history:', error);
    return res.status(500).json({ error: 'Unable to load history' });
  }
});

router.delete('/history/:id', requireAuth, async (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid record id' });
  }

  try {
    const record = await prisma.ziweiRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.ziweiRecord.delete({ where: { id: recordId } });
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Failed to delete Ziwei history:', error);
    return res.status(500).json({ error: 'Unable to delete history' });
  }
});

export default router;

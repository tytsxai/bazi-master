import { logger } from '../config/logger.js';
import express from 'express';

import { castLiurenChart } from '../services/liuren.service.js';

const router = express.Router();

router.post('/chart', (req, res) => {
  const { year, month, day, hour } = req.body || {};
  const now = new Date();
  const y = Number.isInteger(Number(year)) ? Number(year) : now.getFullYear();
  const m = Number.isInteger(Number(month)) ? Number(month) : now.getMonth() + 1;
  const d = Number.isInteger(Number(day)) ? Number(day) : now.getDate();
  const h = Number.isInteger(Number(hour)) ? Number(hour) : now.getHours();

  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31 || h < 0 || h > 23) {
    return res.status(400).json({ error: 'Invalid divination date or hour.' });
  }

  try {
    const chart = castLiurenChart({ year: y, month: m, day: d, hour: h });
    if (!chart) return res.status(400).json({ error: 'Unable to cast chart.' });
    return res.json(chart);
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Liuren cast failed');
    return res.status(500).json({ error: 'Calculation error' });
  }
});

export default router;

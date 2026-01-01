import { logger } from '../config/logger.js';
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { hexagrams } from '../data/ichingHexagrams.js';
import { generateAIContent } from '../services/ai.service.js';
import {
  pickTrigram,
  buildHexagram,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
} from '../services/iching.service.js';

const router = express.Router();

const parseOptionalJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const parseOptionalArray = (value) => {
  const parsed = parseOptionalJson(value);
  return Array.isArray(parsed) ? parsed : null;
};

const parseOptionalObject = (value) => {
  const parsed = parseOptionalJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
};

const parseHexagram = (value) => {
  const parsed = parseOptionalJson(value);
  if (!parsed) return null;
  if (typeof parsed === 'string') return { name: parsed };
  return parsed;
};

const serializeIchingRecord = (record) => ({
  id: record.id,
  userId: record.userId,
  method: record.method,
  numbers: parseOptionalArray(record.numbers),
  hexagram: parseHexagram(record.hexagram),
  resultingHexagram: record.resultingHexagram ? parseHexagram(record.resultingHexagram) : null,
  changingLines: parseOptionalArray(record.changingLines),
  timeContext: parseOptionalObject(record.timeContext),
  userQuestion: record.userQuestion,
  aiInterpretation: record.aiInterpretation,
  createdAt: record.createdAt,
});

router.get('/hexagrams', (req, res) => {
  res.json({ hexagrams });
});

router.post('/divine', (req, res) => {
  const { method = 'number', numbers } = req.body || {};
  let inputNumbers = numbers;
  let timeContext = null;

  if (method === 'time') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    inputNumbers = [year + month + day, hour + minute, year + month + day + hour + minute];
    timeContext = { year, month, day, hour, minute, iso: now.toISOString() };
  } else if (!Array.isArray(numbers) || numbers.length !== 3) {
    return res.status(400).json({ error: 'Provide three numbers for number divination.' });
  }

  const parsedNumbers = inputNumbers.map((value) => Number(value));
  if (parsedNumbers.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'Numbers must be valid integers.' });
  }

  const upperTrigram = pickTrigram(parsedNumbers[0]);
  const lowerTrigram = pickTrigram(parsedNumbers[1]);
  let changingLines = [];
  if (method === 'time' && timeContext) {
    changingLines = deriveChangingLinesFromTimeContext(timeContext);
  } else {
    changingLines = deriveChangingLinesFromNumbers(parsedNumbers);
  }

  if (!upperTrigram || !lowerTrigram) {
    return res
      .status(400)
      .json({ error: 'Unable to compute a hexagram from the provided numbers.' });
  }

  const hexagram = buildHexagram(upperTrigram, lowerTrigram);
  res.json({
    hexagram,
    changingLines,
    timeContext,
    method,
  });
});

router.post('/ai-interpret', requireAuth, async (req, res) => {
  const { hexagram, userQuestion, method, provider } = req.body;
  if (!hexagram) return res.status(400).json({ error: 'Hexagram data required' });

  // Use the same logic as in server.js handleTextMessage for I Ching
  const hexagramName = typeof hexagram === 'string' ? hexagram : hexagram?.name || 'Unknown';
  const system =
    'You are an I Ching interpreter. Provide a concise interpretation in Markdown with sections: Interpretation and Advice. Keep under 200 words.';
  const userPrompt = `
Question: ${userQuestion || 'General Guidance'}
Method: ${method || 'Unknown'}
Hexagram: ${hexagramName}
  `.trim();

  const fallback = () => {
    return 'The hexagram points to steady progress through mindful adaptation.';
  };

  try {
    const content = await generateAIContent({ system, user: userPrompt, fallback, provider });

    // Persist the record
    // method, numbers (if applicable), hexagram, changingLines?
    // Schema: method, numbers(String?), hexagram(String), resultingHexagram?, changingLines?, timeContext?
    // req.body usually has these.
    // We need to robustly stringify specific fields.

    await prisma.ichingRecord.create({
      data: {
        userId: req.user.id,
        method: method || 'unknown',
        numbers: req.body.numbers ? JSON.stringify(req.body.numbers) : null,
        hexagram: typeof hexagram === 'string' ? hexagram : JSON.stringify(hexagram),
        // resultingHexagram, changingLines, timeContext might be in body
        changingLines: req.body.changingLines ? JSON.stringify(req.body.changingLines) : null,
        timeContext: req.body.timeContext ? JSON.stringify(req.body.timeContext) : null,
        userQuestion,
        aiInterpretation: content,
      },
    });

    res.json({ content });
  } catch (error) {
    logger.error('I Ching interpret error:', error);
    res.status(500).json({ error: 'AI interpretation failed' });
  }
});

router.post('/history', requireAuth, async (req, res) => {
  const {
    method,
    numbers,
    hexagram,
    resultingHexagram,
    changingLines,
    timeContext,
    userQuestion,
    aiInterpretation,
  } = req.body || {};
  if (!hexagram) return res.status(400).json({ error: 'Hexagram data required' });

  try {
    const record = await prisma.ichingRecord.create({
      data: {
        userId: req.user.id,
        method: typeof method === 'string' && method.trim() ? method.trim() : 'unknown',
        numbers: numbers ? JSON.stringify(numbers) : null,
        hexagram: typeof hexagram === 'string' ? hexagram : JSON.stringify(hexagram),
        resultingHexagram: resultingHexagram
          ? typeof resultingHexagram === 'string'
            ? resultingHexagram
            : JSON.stringify(resultingHexagram)
          : null,
        changingLines: changingLines ? JSON.stringify(changingLines) : null,
        timeContext: timeContext ? JSON.stringify(timeContext) : null,
        userQuestion: typeof userQuestion === 'string' ? userQuestion : null,
        aiInterpretation: typeof aiInterpretation === 'string' ? aiInterpretation : null,
      },
    });

    return res.json({ record: serializeIchingRecord(record) });
  } catch (error) {
    logger.error('Failed to save I Ching history:', error);
    return res.status(500).json({ error: 'Failed to save history' });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const records = await prisma.ichingRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ records: records.map(serializeIchingRecord) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.delete('/history/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const result = await prisma.ichingRecord.deleteMany({ where: { id, userId: req.user.id } });
    if (!result.count) {
      return res.status(404).json({ error: 'Record not found' });
    }
    return res.json({ status: 'ok' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;

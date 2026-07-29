import { logger } from '../config/logger.js';
import express from 'express';
import { hexagrams } from '../data/ichingHexagrams.js';
import { generateAIContent } from '../services/ai.service.js';
import { createAiGuard, resolveClientKey } from '../lib/concurrency.js';
import {
  pickTrigram,
  buildHexagram,
  deriveChangingLinesFromNumbers,
  deriveChangingLinesFromTimeContext,
} from '../services/iching.service.js';

const router = express.Router();
const aiGuard = createAiGuard();

const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';

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

router.post('/ai-interpret', async (req, res) => {
  const { hexagram, userQuestion, method, provider } = req.body;
  if (!hexagram) return res.status(400).json({ error: 'Hexagram data required' });

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

  const release = await aiGuard.acquire(resolveClientKey(req));
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }

  try {
    const content = await generateAIContent({ system, user: userPrompt, fallback, provider });
    res.json({ content });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'I Ching AI interpretation failed');
    res.status(503).json({ error: 'AI interpretation is currently unavailable' });
  } finally {
    release();
  }
});

export default router;

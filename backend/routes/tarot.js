import { logger } from '../config/logger.js';
import express from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireAuthStrict } from '../middleware/auth.js';
import { drawTarot, getTarotSpreadConfig } from '../services/tarot.service.js';
import tarotDeck from '../data/tarotData.js';
import { generateAIContent } from '../services/ai.service.js';
import { resolveAiProvider } from '../services/ai.service.js';
import { parseIdParam } from '../utils/validation.js';
import { createAiGuard } from '../lib/concurrency.js';

const router = express.Router();
const aiGuard = createAiGuard();

const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';

router.get('/cards', (req, res) => {
  res.json({ cards: tarotDeck });
});

router.post('/draw', async (req, res) => {
  const { spreadType = 'SingleCard' } = req.body || {};
  const normalizedSpread = spreadType || 'SingleCard';
  // Note: Simplified auth logic from original server.js
  res.json(drawTarot({ spreadType: normalizedSpread }));
});

router.post('/ai-interpret', requireAuthStrict, async (req, res) => {
  const { spreadType, cards, userQuestion } = req.body;
  if (!cards || cards.length === 0) return res.status(400).json({ error: 'No cards provided' });

  let provider = null;
  try {
    provider = resolveAiProvider(req.body?.provider);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid AI provider.' });
  }

  const normalizedSpread = spreadType || 'SingleCard';
  const spreadConfig = getTarotSpreadConfig(normalizedSpread);
  const positions = spreadConfig.positions || [];
  const cardList = cards
    .map((card, index) => {
      const positionLabel = card.positionLabel || positions[index]?.label;
      const positionMeaning = card.positionMeaning || positions[index]?.meaning;
      const positionText = [
        positionLabel ? `${positionLabel}` : null,
        positionMeaning ? `${positionMeaning}` : null,
      ]
        .filter(Boolean)
        .join(' — ');
      return `${card.position}. ${positionText ? `${positionText} - ` : ''}${card.name} (${card.isReversed ? 'Reversed' : 'Upright'}) - ${card.isReversed ? card.meaningRev : card.meaningUp}`;
    })
    .join('\n');

  const system =
    'You are a tarot reader. Provide a concise reading in Markdown with sections: Interpretation and Advice. Use the position meanings for context. Keep under 220 words. Reference key cards by name.';
  const userPrompt = `
Spread: ${normalizedSpread || 'Unknown'}
Question: ${userQuestion || 'General Reading'}
Cards:
${cardList}
  `.trim();

  const fallback = () => {
    const interpretation =
      'The spread points to momentum building around your question, with key lessons emerging from the central cards.';
    const advice =
      'Reflect on the card themes and take one grounded action aligned with the most constructive card.';
    return `
## 🔮 Tarot Reading: ${normalizedSpread || 'Unknown'}
**Interpretation:** ${interpretation}

**Advice:** ${advice}
    `.trim();
  };

  const release = await aiGuard.acquire(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }

  // Generation and persistence are separated on purpose. Previously a failed AI call
  // was swallowed by the same catch as a failed insert, and the handler still replied
  // 200 with an empty string — the client had no way to tell success from failure.
  let content = '';
  try {
    content = await generateAIContent({ system, user: userPrompt, fallback, provider });
  } catch (error) {
    logger.error({ err: error, requestId: req.id, provider }, 'Tarot AI interpretation failed');
    return res.status(503).json({ error: 'AI interpretation is currently unavailable' });
  } finally {
    release();
  }

  try {
    await prisma.tarotRecord.create({
      data: {
        userId: req.user.id,
        spreadType: normalizedSpread,
        cards: JSON.stringify(cards),
        userQuestion,
        aiInterpretation: content,
      },
    });
  } catch (error) {
    // History is a convenience; the interpretation itself already succeeded, so a
    // failed insert should not lose it.
    logger.error({ err: error, requestId: req.id }, 'Failed to persist tarot record');
  }

  res.json({ content });
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const records = await prisma.tarotRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    const payload = records.map((record) => ({
      id: record.id,
      spreadType: record.spreadType,
      userQuestion: record.userQuestion,
      aiInterpretation: record.aiInterpretation,
      cards: JSON.parse(record.cards || '[]'),
      createdAt: record.createdAt,
    }));
    res.json({ records: payload });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load history' });
  }
});

router.delete('/history/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });

  try {
    const record = await prisma.tarotRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.tarotRecord.delete({ where: { id: recordId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete record' });
  }
});

export default router;

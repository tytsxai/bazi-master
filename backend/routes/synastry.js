import express from 'express';
import { analyzeSynastry } from '../controllers/synastry.controller.js';
import { requireAuth } from '../middleware/index.js';

const router = express.Router();

// Analyze Synastry - Public or Protected? Let's make it public for now or protected if user saving
// The plan implies just analyzing.
router.post('/analyze', analyzeSynastry);

export default router;

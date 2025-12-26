import express from 'express';
import { generateSoulPortrait } from '../controllers/media.controller.js';
import { requireAuth } from '../middleware/index.js';

const router = express.Router();

// Generate Soul Portrait - Protected route
router.post('/soul-portrait', requireAuth, generateSoulPortrait);

export default router;

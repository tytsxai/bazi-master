import express from 'express';
import { getDailyFortune } from '../controllers/calendar.controller.js';
import { requireAuth } from '../middleware/index.js';

const router = express.Router();

router.get('/daily', requireAuth, getDailyFortune);

export default router;

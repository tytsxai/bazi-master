import express from 'express';
import { getDailyFortune } from '../controllers/calendar.controller.js';

const router = express.Router();

router.get('/daily', getDailyFortune);

export default router;

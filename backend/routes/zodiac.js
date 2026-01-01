import express from 'express';
import {
  getZodiacCompatibility,
  getZodiacHoroscope,
  getZodiacSign,
  postZodiacRising,
} from '../controllers/zodiac.controller.js';

const router = express.Router();

router.get('/compatibility', getZodiacCompatibility);
router.post('/rising', postZodiacRising);
router.get('/:sign/horoscope', getZodiacHoroscope);
router.get('/:sign', getZodiacSign);

export default router;

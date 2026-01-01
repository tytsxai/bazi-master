import {
  getBaziCalculation,
  calculateDailyPillars,
  calculateDailyScore,
} from '../services/calculations.service.js';
import { logger } from '../config/logger.js';
import { isValidCalendarDate } from '../utils/validation.js';

export const getDailyFortune = async (req, res, next) => {
  try {
    // 1. Get User's Chart from active session or request
    // For now assuming we just calculate it on the fly from provided data OR
    // real app would fetch from DB for logged in user.
    // Let's support passing bazi data in body or query for flexibility in this demo phase.

    // In a real scenario: const user = req.user;

    // Fallback: If no chart provided, just return daily pillars.
    const { birthYear, birthMonth, birthDay, birthHour, gender } = req.query; // or req.user

    let userChart = null;
    const hasAnyBirthParams = [birthYear, birthMonth, birthDay, birthHour, gender].some(
      (value) => value !== undefined
    );
    if (hasAnyBirthParams) {
      const parsedYear = Number.parseInt(birthYear, 10);
      const parsedMonth = Number.parseInt(birthMonth, 10);
      const parsedDay = Number.parseInt(birthDay, 10);
      const parsedHour = Number.parseInt(birthHour, 10);
      const normalizedGender = typeof gender === 'string' ? gender.trim().toLowerCase() : '';
      const genderValid = normalizedGender === 'male' || normalizedGender === 'female';

      if (
        !Number.isInteger(parsedYear) ||
        !Number.isInteger(parsedMonth) ||
        !Number.isInteger(parsedDay) ||
        !Number.isInteger(parsedHour) ||
        parsedHour < 0 ||
        parsedHour > 23 ||
        !genderValid ||
        !isValidCalendarDate(parsedYear, parsedMonth, parsedDay)
      ) {
        return res.status(400).json({
          error:
            'Invalid birth data. Provide birthYear, birthMonth, birthDay, birthHour, and gender.',
        });
      }

      userChart = await getBaziCalculation({
        birthYear: parsedYear,
        birthMonth: parsedMonth,
        birthDay: parsedDay,
        birthHour: parsedHour,
        gender: normalizedGender,
      });
    }

    const today = new Date();
    const dailyPillars = calculateDailyPillars(today);

    let fortune = null;
    if (userChart) {
      fortune = calculateDailyScore(userChart, dailyPillars);
    }

    res.json({
      date: dailyPillars.date,
      dailyPillar: dailyPillars,
      fortune: fortune || { message: 'Provide birth data for personalized fortune' },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get daily fortune');
    next(error);
  }
};

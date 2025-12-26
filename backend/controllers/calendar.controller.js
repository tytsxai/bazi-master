import { getBaziCalculation, calculateDailyPillars, calculateDailyScore } from '../services/calculations.service.js';
import { logger } from '../config/logger.js';

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
        if (birthYear) {
            userChart = await getBaziCalculation({
                birthYear: parseInt(birthYear),
                birthMonth: parseInt(birthMonth),
                birthDay: parseInt(birthDay),
                birthHour: parseInt(birthHour),
                gender
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
            fortune: fortune || { message: 'Provide birth data for personalized fortune' }
        });

    } catch (error) {
        logger.error({ error }, 'Failed to get daily fortune');
        next(error);
    }
};

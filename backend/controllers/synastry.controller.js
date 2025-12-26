import { getBaziCalculation } from '../services/calculations.service.js';
import { calculateCompatibility } from '../services/synastry.service.js';
import { logger } from '../config/logger.js';

export const analyzeSynastry = async (req, res, next) => {
    try {
        const { personA, personB } = req.body;

        if (!personA || !personB) {
            return res.status(400).json({ error: 'Data for both persons is required' });
        }

        // Calculate charts for both
        // Assuming personA/B object structure matches what getBaziCalculation expects
        // { birthYear, birthMonth, birthDay, birthHour, gender }

        const [chartA, chartB] = await Promise.all([
            getBaziCalculation(personA),
            getBaziCalculation(personB)
        ]);

        const compatibility = calculateCompatibility(chartA, chartB);

        res.json({
            personA: {
                name: personA.name || 'Person A',
                dayMaster: chartA.pillars.day.stem,
                element: chartA.pillars.day.elementStem
            },
            personB: {
                name: personB.name || 'Person B',
                dayMaster: chartB.pillars.day.stem,
                element: chartB.pillars.day.elementStem
            },
            compatibility
        });
    } catch (error) {
        logger.error({ error }, 'Synastry analysis failed');
        next(error);
    }
};

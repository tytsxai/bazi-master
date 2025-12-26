import { generateImage } from '../services/ai.service.js';
import { logger } from '../config/logger.js';

export const generateSoulPortrait = async (req, res, next) => {
    try {
        const { baziData } = req.body;

        if (!baziData) {
            return res.status(400).json({ error: 'Bazi data is required' });
        }

        // Construct a creative prompt based on Bazi elements
        // This is valid: relying on the frontend to pass processed data or just raw pillars
        // Let's assume frontend passes a summary or we extract from pillars
        // For simplicity, let's assume baziData contains: { dayMasterElement, strongestElement, dominantTenGod }

        const { dayMasterElement, strongestElement, dominantTenGod } = baziData;

        const elementColors = {
            Wood: 'emerald green and vibrant teal',
            Fire: 'crimson red and brilliant gold',
            Earth: 'terracotta and warm ochre',
            Metal: 'shimmering silver and white',
            Water: 'deep navy blue and fluid black'
        };

        const elementThemes = {
            Wood: 'lush forests, growth, life, ancient trees',
            Fire: 'radiant sun, phoenix, rising energy, light',
            Earth: 'majestic mountains, crystals, grounding stability',
            Metal: 'sharp geometric crystal structures, precision, clarity',
            Water: 'vast oceans, waterfalls, fluidity, mystery'
        };

        const dmColor = elementColors[dayMasterElement] || 'mystical colors';
        const strengthTheme = elementThemes[strongestElement] || 'ethereal light';

        const prompt = `A hyper-realistic, mystical spiritual art portrait representing the soul. 
    Theme: ${dmColor} hues dominating, blended with ${strengthTheme}. 
    Symbolism: ${dominantTenGod ? `incorporating subtle symbols of ${dominantTenGod}` : 'sacred geometry'}. 
    Style: Ethereal, dreamlike, cinematic lighting, 8k resolution, digital art masterpiece. 
    No text, no watermarks.`;

        logger.info({ prompt }, 'Generating Soul Portrait');

        const imageUrl = await generateImage({ prompt, provider: 'openai' });

        res.json({ imageUrl });
    } catch (error) {
        logger.error({ error }, 'Failed to generate soul portrait');
        next(error);
    }
};

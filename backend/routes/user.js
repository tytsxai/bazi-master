import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserSettings, putUserSettings } from '../controllers/user.controller.js';

const router = express.Router();

// All user routes require authentication
router.use(requireAuth);

router.get('/settings', getUserSettings);
router.put('/settings', putUserSettings);

export default router;

import express from 'express';
import { getServerConfig as getServerConfigFromEnv } from '../config/app.js';

const router = express.Router();

const {
  aiProvider: AI_PROVIDER,
  availableProviders: AVAILABLE_PROVIDERS,
} = getServerConfigFromEnv();

// AI Info
router.get('/providers', (req, res) => {
  res.json({
    activeProvider: AI_PROVIDER,
    providers: AVAILABLE_PROVIDERS
  });
});

export default router;

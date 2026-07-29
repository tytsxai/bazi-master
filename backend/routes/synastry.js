import express from 'express';
import { analyzeSynastry } from '../controllers/synastry.controller.js';

const router = express.Router();

// 合盘分析。账号系统已从项目移除，所有业务接口一律公开，无需鉴权。
// The plan implies just analyzing.
router.post('/analyze', analyzeSynastry);

export default router;

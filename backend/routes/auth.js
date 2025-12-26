import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Auth routes
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.delete('/me', requireAuth, async (req, res) => {
  try {
    // For now, just return success - full implementation needs user cleanup
    res.json({ message: 'User account would be deleted' });
  } catch (error) {
    console.error('User self-delete failed:', error);
    res.status(500).json({ error: 'Unable to delete account' });
  }
});

export default router;

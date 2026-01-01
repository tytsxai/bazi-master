import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { revokeSession } from '../middleware/auth.js';
import { deleteUserCascade } from '../userCleanup.js';

const readBearerToken = (req) => {
  const auth = req.headers.authorization || '';
  if (typeof auth !== 'string') return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
};

const parsePreferences = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return null;
};

const serializePreferences = (prefs) => {
  if (!prefs || typeof prefs !== 'object') return null;
  try {
    return JSON.stringify(prefs);
  } catch {
    return null;
  }
};

const normalizeLocale = (value) => (typeof value === 'string' ? value.trim() || null : null);

export const getAuthMe = (req, res) => {
  res.json({ user: req.user });
};

export const deleteAuthMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: 'Invalid user' });
    const token = readBearerToken(req);
    await deleteUserCascade({
      prisma,
      userId,
      cleanupUserMemory: () => revokeSession(token),
    });
    return res.json({ status: 'ok' });
  } catch (error) {
    logger.error('User self-delete failed:', error);
    return res.status(500).json({ error: 'Unable to delete account' });
  }
};

export const getUserSettings = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: 'Invalid user' });

  try {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const preferences = settings ? parsePreferences(settings.preferences) : null;
    return res.json({
      settings: {
        locale: settings?.locale ?? null,
        preferences,
      },
    });
  } catch (error) {
    logger.error('Failed to load user settings:', error);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
};

export const putUserSettings = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: 'Invalid user' });

  const body = req.body || {};
  const locale = normalizeLocale(body.locale);
  const hasLocale = Object.prototype.hasOwnProperty.call(body, 'locale');
  const hasPreferences = Object.prototype.hasOwnProperty.call(body, 'preferences');
  const preferences = parsePreferences(body.preferences);

  if (hasLocale && body.locale !== null && body.locale !== undefined && locale === null) {
    return res.status(400).json({ error: 'Invalid locale' });
  }
  if (
    hasPreferences &&
    body.preferences !== null &&
    body.preferences !== undefined &&
    !preferences
  ) {
    return res.status(400).json({ error: 'Invalid preferences' });
  }

  const updateData = {};
  if (hasLocale) updateData.locale = locale;
  if (hasPreferences) updateData.preferences = serializePreferences(preferences);

  const createData = {
    userId,
    locale: hasLocale ? locale : null,
    preferences: hasPreferences ? serializePreferences(preferences) : null,
  };

  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: createData,
      update: updateData,
    });

    return res.json({
      settings: {
        locale: settings.locale ?? null,
        preferences: parsePreferences(settings.preferences),
      },
    });
  } catch (error) {
    logger.error('Failed to update user settings:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
};

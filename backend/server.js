import express from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import { PrismaClient, Prisma } from '@prisma/client';
import { Solar } from 'lunar-javascript';
import tarotDeck from './data/tarotData.js';
import { TRIGRAMS, hexagrams, hexagramByTrigrams, hexagramByLines } from './data/ichingHexagrams.js';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
console.log('--- SERVER STARTING: FIX APPLIED ---');

const ensureSoftDeleteTables = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS BaziRecordTrash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      recordId INTEGER NOT NULL,
      deletedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, recordId)
    );
  `);
};

const ensureSoftDeleteReady = (() => {
  let ready = null;
  return async () => {
    if (!ready) {
      ready = ensureSoftDeleteTables().catch((error) => {
        console.error('Failed to ensure soft delete tables:', error);
        throw error;
      });
    }
    return ready;
  };
})();

const fetchDeletedRecordIds = async (userId) => {
  await ensureSoftDeleteReady();
  const rows = await prisma.$queryRaw`SELECT recordId FROM BaziRecordTrash WHERE userId = ${userId}`;
  return rows.map((row) => row.recordId);
};

const isRecordSoftDeleted = async (userId, recordId) => {
  await ensureSoftDeleteReady();
  const rows = await prisma.$queryRaw`
    SELECT 1 as exists FROM BaziRecordTrash WHERE userId = ${userId} AND recordId = ${recordId} LIMIT 1
  `;
  return rows.length > 0;
};

app.use(cors());
app.use(express.json());

const MAX_URL_LENGTH = Number(process.env.MAX_URL_LENGTH || 16384);

const isUrlTooLong = (req) => {
  const url = req?.originalUrl || req?.url || '';
  return url.length > MAX_URL_LENGTH;
};

const isWhitespaceOnly = (value) =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;

app.use((req, res, next) => {
  if (isUrlTooLong(req)) {
    return res.status(414).json({ error: 'Request-URI Too Long' });
  }
  return next();
});

// --- AI Provider Settings ---
const AI_PROVIDER = (process.env.AI_PROVIDER
  || (process.env.OPENAI_API_KEY ? 'openai' : null)
  || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : null)
  || 'mock').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 700);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);
const AI_CONCURRENCY_ERROR = 'AI request already in progress. Please wait.';
const aiInFlightByUser = new Set();
const baziSubmitInFlight = new Map();

const AVAILABLE_PROVIDERS = [
  { name: 'openai', enabled: Boolean(process.env.OPENAI_API_KEY) },
  { name: 'anthropic', enabled: Boolean(process.env.ANTHROPIC_API_KEY) },
  { name: 'mock', enabled: true }
];

const fetchWithTimeout = async (url, options, timeoutMs = AI_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
};

const WS_PATH = '/ws/ai';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_MAX_PAYLOAD = 1_000_000;

const buildWsAcceptKey = (key) => {
  return crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
};

const encodeWsFrame = (data, opcode = 0x1) => {
  const payload = Buffer.from(data);
  const payloadLength = payload.length;
  let header = null;

  if (payloadLength < 126) {
    header = Buffer.alloc(2);
    header[1] = payloadLength;
  } else if (payloadLength < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payloadLength), 2);
  }

  header[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([header, payload]);
};

const decodeWsFrames = (buffer) => {
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];
    const fin = (byte1 & 0x80) !== 0;
    const opcode = byte1 & 0x0f;
    const masked = (byte2 & 0x80) !== 0;
    let payloadLength = byte2 & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 4) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) break;
      const length64 = buffer.readBigUInt64BE(offset + 2);
      payloadLength = Number(length64);
      headerLength = 10;
    }

    const maskOffset = headerLength;
    const fullHeader = masked ? headerLength + 4 : headerLength;
    if (buffer.length - offset < fullHeader + payloadLength) break;

    const payloadStart = offset + fullHeader;
    const payload = buffer.slice(payloadStart, payloadStart + payloadLength);
    let unmaskedPayload = payload;

    if (masked) {
      const mask = buffer.slice(offset + maskOffset, offset + maskOffset + 4);
      unmaskedPayload = Buffer.alloc(payloadLength);
      for (let i = 0; i < payloadLength; i += 1) {
        unmaskedPayload[i] = payload[i] ^ mask[i % 4];
      }
    }

    frames.push({ fin, opcode, payload: unmaskedPayload });
    offset = payloadStart + payloadLength;
  }

  return { frames, remainder: buffer.slice(offset) };
};

const sendWsJson = (socket, data) => {
  if (!socket.writable) return;
  const payload = JSON.stringify(data);
  socket.write(encodeWsFrame(payload));
};

const callOpenAI = async ({ system, user }) => {
  if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: AI_MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim();
};

const callAnthropic = async ({ system, user }) => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured');
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: AI_MAX_TOKENS,
      temperature: 0.7,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const contentBlock = Array.isArray(data?.content) ? data.content[0]?.text : null;
  return contentBlock?.trim();
};

const generateAIContent = async ({ system, user, fallback }) => {
  try {
    if (AI_PROVIDER === 'openai') {
      return await callOpenAI({ system, user });
    }
    if (AI_PROVIDER === 'anthropic') {
      return await callAnthropic({ system, user });
    }
  } catch (error) {
    console.error('AI provider error:', error);
  }
  return fallback();
};

const acquireAiGuard = (userId) => {
  if (!userId) return () => {};
  if (aiInFlightByUser.has(userId)) return null;
  aiInFlightByUser.add(userId);
  return () => {
    aiInFlightByUser.delete(userId);
  };
};

const buildBaziPrompt = ({ pillars, fiveElements, tenGods, luckCycles, strength }) => {
  const elementLines = fiveElements
    ? Object.entries(fiveElements).map(([key, value]) => `- ${key}: ${value}`).join('\n')
    : '- Not provided';
  const tenGodLines = Array.isArray(tenGods)
    ? tenGods
      .filter((tg) => tg?.strength > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map((tg) => `- ${tg.name}: ${tg.strength}`)
      .join('\n')
    : '- Not provided';
  const luckLines = Array.isArray(luckCycles)
    ? luckCycles.map((cycle) => `- ${cycle.range}: ${cycle.stem}${cycle.branch}`).join('\n')
    : '- Not provided';

  const system = 'You are a seasoned BaZi practitioner. Provide a concise, grounded interpretation in Markdown with sections: Summary, Key Patterns, Advice. Keep under 220 words.';
  const user = `
Day Master: ${pillars?.day?.stem || 'Unknown'} (${pillars?.day?.elementStem || 'Unknown'})
Month Pillar: ${pillars?.month?.stem || 'Unknown'} ${pillars?.month?.branch || 'Unknown'} (${pillars?.month?.elementBranch || 'Unknown'})
Five Elements:
${elementLines}
Ten Gods (top):
${tenGodLines}
Luck Cycles:
${luckLines}
Strength Notes: ${strength || 'Not provided'}
  `.trim();

  const fallback = () => `
## 🔮 AI BaZi Analysis
**Summary:** A ${pillars?.day?.elementStem || 'balanced'} Day Master chart with notable elemental distribution.

**Key Patterns:**
${tenGodLines}

**Advice:**
Focus on balancing elements that are lower in count and lean into favorable cycles.
  `.trim();

  return { system, user, fallback };
};

const ensureUserSettingsTable = async () => {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS UserSettings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL UNIQUE,
        locale TEXT,
        preferences TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Failed to ensure UserSettings table:', error);
  }
};

const ensureDefaultUser = async () => {
  const email = 'test@example.com';
  const password = 'password123';
  const name = 'Test User';
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({ data: { email, password, name } });
      return;
    }
    if (existing.password !== password || existing.name !== name) {
      await prisma.user.update({ where: { email }, data: { password, name } });
    }
  } catch (error) {
    console.error('Failed to ensure default user:', error);
  }
};

const parsePreferences = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const buildSettingsEtag = (row) => {
  if (!row?.updatedAt) return null;
  return `W/"${row.updatedAt}"`;
};

const parseIfMatchHeader = (headerValue) => {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const token = headerValue.split(',')[0].trim();
  if (!token) return null;
  if (token === '*') return '*';
  if (token.startsWith('W/"') && token.endsWith('"')) {
    return token.slice(3, -1);
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  return token;
};

const buildBaziSubmitKey = (userId, payload) => {
  if (!userId || !payload) return null;
  const birthLocation =
    typeof payload.birthLocation === 'string' ? payload.birthLocation.trim() : '';
  const timezone = typeof payload.timezone === 'string' ? payload.timezone.trim() : '';
  const gender =
    typeof payload.gender === 'string' ? payload.gender.trim().toLowerCase() : '';
  const keyPayload = {
    userId,
    birthYear: payload.birthYear,
    birthMonth: payload.birthMonth,
    birthDay: payload.birthDay,
    birthHour: payload.birthHour,
    gender,
    birthLocation,
    timezone,
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(keyPayload)).digest('hex');
  return `${userId}:${hash}`;
};

// --- Mappings & Constants ---
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS || 30 * 60 * 1000);
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_TOKEN_TTL_MS || 30 * 60 * 1000);
const sessionStore = new Map();
const resetTokenStore = new Map();
const resetTokenByUser = new Map();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/google/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map();
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'admin@example.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const WECHAT_SCOPE = process.env.WECHAT_SCOPE || 'snsapi_login';
const WECHAT_FRONTEND_URL = process.env.WECHAT_FRONTEND_URL || FRONTEND_URL || 'http://localhost:3000';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI
  || `${process.env.BACKEND_BASE_URL || 'http://localhost:4000'}/api/auth/wechat/callback`;
const WECHAT_STATE_TTL_MS = 10 * 60 * 1000;
const wechatStateStore = new Map();

const parseAuthToken = (token) => {
  const match = token.match(/^token_(\d+)_(\d+)$/);
  if (!match) return null;
  const userId = Number(match[1]);
  const issuedAt = Number(match[2]);
  if (!Number.isFinite(userId) || !Number.isFinite(issuedAt)) return null;
  return { userId, issuedAt };
};

const sanitizeNextPath = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
  return trimmed;
};

const buildOauthState = (nextPath) => {
  const state = crypto.randomBytes(24).toString('hex');
  oauthStateStore.set(state, { createdAt: Date.now(), nextPath });
  return state;
};

const consumeOauthState = (state) => {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  oauthStateStore.delete(state);
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) return null;
  return entry;
};

const buildOauthRedirectUrl = ({ token, user, nextPath, error }) => {
  const redirectUrl = new URL('/login', FRONTEND_URL);
  if (token) redirectUrl.searchParams.set('token', token);
  if (user) {
    const encodedUser = Buffer.from(JSON.stringify(user)).toString('base64url');
    redirectUrl.searchParams.set('user', encodedUser);
  }
  if (nextPath) redirectUrl.searchParams.set('next', nextPath);
  if (error) redirectUrl.searchParams.set('error', error);
  return redirectUrl.toString();
};

const isAdminUser = (user) => {
  if (!user?.email) return false;
  return ADMIN_EMAILS.has(String(user.email).toLowerCase());
};

const createWeChatState = (redirectPath) => {
  const state = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  wechatStateStore.set(state, { createdAt: now, redirectPath });
  for (const [key, entry] of wechatStateStore.entries()) {
    if (now - entry.createdAt > WECHAT_STATE_TTL_MS) {
      wechatStateStore.delete(key);
    }
  }
  return state;
};

const consumeWeChatState = (state) => {
  const entry = wechatStateStore.get(state);
  if (!entry) return null;
  wechatStateStore.delete(state);
  if (Date.now() - entry.createdAt > WECHAT_STATE_TTL_MS) return null;
  return entry.redirectPath;
};

const createResetToken = (userId) => {
  const existingToken = resetTokenByUser.get(userId);
  if (existingToken) {
    resetTokenStore.delete(existingToken);
  }
  const token = crypto.randomBytes(24).toString('hex');
  resetTokenStore.set(token, { userId, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
  resetTokenByUser.set(userId, token);
  return token;
};

const consumeResetToken = (token) => {
  if (!token) return null;
  const entry = resetTokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resetTokenStore.delete(token);
    if (resetTokenByUser.get(entry.userId) === token) {
      resetTokenByUser.delete(entry.userId);
    }
    return null;
  }
  resetTokenStore.delete(token);
  if (resetTokenByUser.get(entry.userId) === token) {
    resetTokenByUser.delete(entry.userId);
  }
  return entry.userId;
};

// Pinyin and Element mappings for Stems (TianGan)
const STEMS_MAP = {
  '甲': { name: 'Jia', element: 'Wood', polarity: '+' },
  '乙': { name: 'Yi', element: 'Wood', polarity: '-' },
  '丙': { name: 'Bing', element: 'Fire', polarity: '+' },
  '丁': { name: 'Ding', element: 'Fire', polarity: '-' },
  '戊': { name: 'Wu', element: 'Earth', polarity: '+' },
  '己': { name: 'Ji', element: 'Earth', polarity: '-' },
  '庚': { name: 'Geng', element: 'Metal', polarity: '+' },
  '辛': { name: 'Xin', element: 'Metal', polarity: '-' },
  '壬': { name: 'Ren', element: 'Water', polarity: '+' },
  '癸': { name: 'Gui', element: 'Water', polarity: '-' },
};

// Pinyin and Element mappings for Branches (DiZhi)
const BRANCHES_MAP = {
  '子': { name: 'Zi', element: 'Water', polarity: '+' }, // Standard Polarity for rendering/basic logic
  '丑': { name: 'Chou', element: 'Earth', polarity: '-' },
  '寅': { name: 'Yin', element: 'Wood', polarity: '+' },
  '卯': { name: 'Mao', element: 'Wood', polarity: '-' },
  '辰': { name: 'Chen', element: 'Earth', polarity: '+' },
  '巳': { name: 'Si', element: 'Fire', polarity: '-' },
  '午': { name: 'Wu', element: 'Fire', polarity: '+' },
  '未': { name: 'Wei', element: 'Earth', polarity: '-' },
  '申': { name: 'Shen', element: 'Metal', polarity: '+' },
  '酉': { name: 'You', element: 'Metal', polarity: '-' },
  '戌': { name: 'Xu', element: 'Earth', polarity: '+' },
  '亥': { name: 'Hai', element: 'Water', polarity: '-' },
};

// Five Elements Generating/Controlling relationships
// Generated order: Wood -> Fire -> Earth -> Metal -> Water -> Wood
// Controlled order: Wood -> Earth -> Water -> Fire -> Metal -> Wood
const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

const ZODIAC_SIGNS = {
  aries: {
    name: 'Aries',
    dateRange: 'Mar 21 - Apr 19',
    element: 'Fire',
    modality: 'Cardinal',
    rulingPlanet: 'Mars',
    symbol: 'The Ram',
    keywords: ['bold', 'pioneering', 'direct'],
    strengths: ['courageous', 'decisive', 'energetic'],
    challenges: ['impatient', 'impulsive', 'restless'],
    luckyColors: ['Crimson', 'Gold'],
    luckyNumbers: [1, 9, 18],
    compatibility: ['Leo', 'Sagittarius', 'Gemini', 'Aquarius']
  },
  taurus: {
    name: 'Taurus',
    dateRange: 'Apr 20 - May 20',
    element: 'Earth',
    modality: 'Fixed',
    rulingPlanet: 'Venus',
    symbol: 'The Bull',
    keywords: ['steady', 'sensual', 'grounded'],
    strengths: ['patient', 'loyal', 'practical'],
    challenges: ['stubborn', 'possessive', 'slow to change'],
    luckyColors: ['Emerald', 'Forest Green'],
    luckyNumbers: [2, 6, 24],
    compatibility: ['Virgo', 'Capricorn', 'Cancer', 'Pisces']
  },
  gemini: {
    name: 'Gemini',
    dateRange: 'May 21 - Jun 20',
    element: 'Air',
    modality: 'Mutable',
    rulingPlanet: 'Mercury',
    symbol: 'The Twins',
    keywords: ['curious', 'social', 'quick-witted'],
    strengths: ['adaptable', 'expressive', 'versatile'],
    challenges: ['restless', 'inconsistent', 'scattered'],
    luckyColors: ['Yellow', 'Sky Blue'],
    luckyNumbers: [3, 5, 12],
    compatibility: ['Libra', 'Aquarius', 'Aries', 'Leo']
  },
  cancer: {
    name: 'Cancer',
    dateRange: 'Jun 21 - Jul 22',
    element: 'Water',
    modality: 'Cardinal',
    rulingPlanet: 'Moon',
    symbol: 'The Crab',
    keywords: ['intuitive', 'protective', 'nurturing'],
    strengths: ['empathetic', 'loyal', 'caring'],
    challenges: ['moody', 'guarded', 'overly cautious'],
    luckyColors: ['Silver', 'Sea Green'],
    luckyNumbers: [4, 7, 16],
    compatibility: ['Scorpio', 'Pisces', 'Taurus', 'Virgo']
  },
  leo: {
    name: 'Leo',
    dateRange: 'Jul 23 - Aug 22',
    element: 'Fire',
    modality: 'Fixed',
    rulingPlanet: 'Sun',
    symbol: 'The Lion',
    keywords: ['radiant', 'confident', 'generous'],
    strengths: ['charismatic', 'creative', 'warm'],
    challenges: ['proud', 'dramatic', 'stubborn'],
    luckyColors: ['Gold', 'Amber'],
    luckyNumbers: [1, 10, 19],
    compatibility: ['Aries', 'Sagittarius', 'Gemini', 'Libra']
  },
  virgo: {
    name: 'Virgo',
    dateRange: 'Aug 23 - Sep 22',
    element: 'Earth',
    modality: 'Mutable',
    rulingPlanet: 'Mercury',
    symbol: 'The Maiden',
    keywords: ['precise', 'service-oriented', 'observant'],
    strengths: ['organized', 'thoughtful', 'reliable'],
    challenges: ['overcritical', 'anxious', 'perfectionist'],
    luckyColors: ['Olive', 'Ivory'],
    luckyNumbers: [5, 14, 23],
    compatibility: ['Taurus', 'Capricorn', 'Cancer', 'Scorpio']
  },
  libra: {
    name: 'Libra',
    dateRange: 'Sep 23 - Oct 22',
    element: 'Air',
    modality: 'Cardinal',
    rulingPlanet: 'Venus',
    symbol: 'The Scales',
    keywords: ['harmonious', 'diplomatic', 'aesthetic'],
    strengths: ['fair-minded', 'charming', 'balanced'],
    challenges: ['indecisive', 'avoidant', 'people-pleasing'],
    luckyColors: ['Rose', 'Sapphire'],
    luckyNumbers: [6, 15, 24],
    compatibility: ['Gemini', 'Aquarius', 'Leo', 'Sagittarius']
  },
  scorpio: {
    name: 'Scorpio',
    dateRange: 'Oct 23 - Nov 21',
    element: 'Water',
    modality: 'Fixed',
    rulingPlanet: 'Pluto',
    symbol: 'The Scorpion',
    keywords: ['intense', 'magnetic', 'private'],
    strengths: ['resourceful', 'loyal', 'focused'],
    challenges: ['secretive', 'jealous', 'all-or-nothing'],
    luckyColors: ['Burgundy', 'Black'],
    luckyNumbers: [8, 11, 22],
    compatibility: ['Cancer', 'Pisces', 'Virgo', 'Capricorn']
  },
  sagittarius: {
    name: 'Sagittarius',
    dateRange: 'Nov 22 - Dec 21',
    element: 'Fire',
    modality: 'Mutable',
    rulingPlanet: 'Jupiter',
    symbol: 'The Archer',
    keywords: ['adventurous', 'optimistic', 'free-spirited'],
    strengths: ['honest', 'visionary', 'enthusiastic'],
    challenges: ['impatient', 'tactless', 'overextended'],
    luckyColors: ['Violet', 'Indigo'],
    luckyNumbers: [3, 12, 21],
    compatibility: ['Aries', 'Leo', 'Libra', 'Aquarius']
  },
  capricorn: {
    name: 'Capricorn',
    dateRange: 'Dec 22 - Jan 19',
    element: 'Earth',
    modality: 'Cardinal',
    rulingPlanet: 'Saturn',
    symbol: 'The Mountain Goat',
    keywords: ['ambitious', 'disciplined', 'strategic'],
    strengths: ['responsible', 'persistent', 'practical'],
    challenges: ['rigid', 'pessimistic', 'workaholic'],
    luckyColors: ['Charcoal', 'Brown'],
    luckyNumbers: [4, 13, 22],
    compatibility: ['Taurus', 'Virgo', 'Scorpio', 'Pisces']
  },
  aquarius: {
    name: 'Aquarius',
    dateRange: 'Jan 20 - Feb 18',
    element: 'Air',
    modality: 'Fixed',
    rulingPlanet: 'Uranus',
    symbol: 'The Water Bearer',
    keywords: ['innovative', 'independent', 'visionary'],
    strengths: ['original', 'humanitarian', 'inventive'],
    challenges: ['detached', 'unpredictable', 'stubborn'],
    luckyColors: ['Electric Blue', 'Silver'],
    luckyNumbers: [7, 11, 20],
    compatibility: ['Gemini', 'Libra', 'Aries', 'Sagittarius']
  },
  pisces: {
    name: 'Pisces',
    dateRange: 'Feb 19 - Mar 20',
    element: 'Water',
    modality: 'Mutable',
    rulingPlanet: 'Neptune',
    symbol: 'The Fish',
    keywords: ['dreamy', 'compassionate', 'artistic'],
    strengths: ['intuitive', 'empathetic', 'imaginative'],
    challenges: ['escapist', 'overly sensitive', 'indecisive'],
    luckyColors: ['Seafoam', 'Lavender'],
    luckyNumbers: [2, 9, 18],
    compatibility: ['Cancer', 'Scorpio', 'Taurus', 'Capricorn']
  }
};

const ZODIAC_PERIODS = new Set(['daily', 'weekly', 'monthly']);

const formatDateLabel = (date, options) =>
  date.toLocaleDateString('en-US', options);

const getWeekRange = (date) => {
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDateLabel(start, { month: 'short', day: 'numeric' })} - ${formatDateLabel(end, { month: 'short', day: 'numeric' })}`;
};

const normalizeSign = (raw) => raw?.toString().trim().toLowerCase();
const sanitizeQueryParam = (raw) => {
  const normalized = normalizeSign(raw);
  if (!normalized) return null;
  if (!/^[a-z]+$/.test(normalized)) return null;
  return normalized;
};
const ZODIAC_ORDER = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
];

const normalizeAngle = (deg) => ((deg % 360) + 360) % 360;
const degToRad = (deg) => (deg * Math.PI) / 180;
const radToDeg = (rad) => (rad * 180) / Math.PI;

const calculateRisingSign = ({
  birthYear,
  birthMonth,
  birthDay,
  birthHour,
  birthMinute,
  latitude,
  longitude,
  timezoneOffsetMinutes
}) => {
  const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
  const utcMillis = Date.UTC(
    birthYear,
    birthMonth - 1,
    birthDay,
    birthHour,
    birthMinute || 0,
    0
  ) - offsetMinutes * 60 * 1000;

  const jd = utcMillis / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const gmst = normalizeAngle(
    280.46061837 +
      360.98564736629 * (jd - 2451545.0) +
      0.000387933 * t * t -
      (t * t * t) / 38710000
  );
  const lst = normalizeAngle(gmst + longitude);

  const theta = degToRad(lst);
  const epsilon = degToRad(23.439291 - 0.0130042 * t);
  const phi = degToRad(latitude);

  const ascRad = Math.atan2(
    -Math.cos(theta),
    Math.sin(theta) * Math.cos(epsilon) + Math.tan(phi) * Math.sin(epsilon)
  );
  const ascDeg = normalizeAngle(radToDeg(ascRad) + 180);
  const signIndex = Math.floor(ascDeg / 30);
  const signKey = ZODIAC_ORDER[signIndex] || 'aries';

  return {
    signKey,
    ascendant: {
      longitude: Number(ascDeg.toFixed(2)),
      localSiderealTime: Number((lst / 15).toFixed(2))
    }
  };
};

const buildHoroscope = (sign, period) => {
  const now = new Date();
  const range =
    period === 'daily'
      ? formatDateLabel(now, { month: 'short', day: 'numeric', year: 'numeric' })
      : period === 'weekly'
        ? getWeekRange(now)
        : formatDateLabel(now, { month: 'long', year: 'numeric' });

  const focusMap = {
    daily: 'short, intentional steps',
    weekly: 'strategic momentum',
    monthly: 'long-term alignment'
  };

  const energyMap = {
    Fire: 'spark and momentum',
    Earth: 'steadiness and structure',
    Air: 'clarity and connection',
    Water: 'intuition and depth'
  };

  return {
    overview: `Your ${sign.element.toLowerCase()} energy brings ${energyMap[sign.element]} today. Lead with ${sign.keywords[0]} choices and let ${focusMap[period]} guide your pace.`,
    love: `In relationships, lean into ${sign.keywords[1]} expression. A clear invitation or gentle check-in strengthens bonds.`,
    career: `Work flows when you apply your ${sign.strengths[1]} instincts. Prioritize the task that unlocks the rest.`,
    wellness: `Balance your drive with grounding rituals. Stretch, hydrate, and carve out a quiet reset.`,
    lucky: {
      colors: sign.luckyColors,
      numbers: sign.luckyNumbers
    },
    mantra: `I honor my ${sign.element.toLowerCase()} nature and move with ${sign.keywords[2]} confidence.`
  };
};

const ELEMENT_COMPATIBILITY = {
  Fire: {
    Fire: { score: 12, note: 'Shared fire energy creates bold momentum.' },
    Air: { score: 15, note: 'Air feeds Fire, sparking inspiration and action.' },
    Earth: { score: -3, note: 'Fire can feel contained by Earth’s steady pace.' },
    Water: { score: -6, note: 'Fire and Water can steam up communication.' }
  },
  Air: {
    Fire: { score: 15, note: 'Air fuels Fire, keeping ideas lively.' },
    Air: { score: 12, note: 'Shared air energy keeps things curious and social.' },
    Earth: { score: -4, note: 'Air may find Earth too fixed while Earth craves certainty.' },
    Water: { score: -2, note: 'Air can feel abstract to Water’s emotional depth.' }
  },
  Earth: {
    Fire: { score: -3, note: 'Earth prefers patience while Fire wants fast movement.' },
    Air: { score: -4, note: 'Earth seeks stability while Air seeks change.' },
    Earth: { score: 12, note: 'Shared earth energy builds reliability and trust.' },
    Water: { score: 15, note: 'Water nourishes Earth, creating a supportive bond.' }
  },
  Water: {
    Fire: { score: -6, note: 'Water can cool Fire, creating emotional distance.' },
    Air: { score: -2, note: 'Water looks for depth while Air wants space.' },
    Earth: { score: 15, note: 'Earth holds Water, creating steadiness and care.' },
    Water: { score: 12, note: 'Shared water energy heightens empathy and intuition.' }
  }
};

const MODALITY_COMPATIBILITY = {
  Cardinal: {
    Cardinal: { score: 4, note: 'Both initiate quickly, so pace-setting matters.' },
    Fixed: { score: 2, note: 'Cardinal sparks action while Fixed sustains it.' },
    Mutable: { score: 3, note: 'Cardinal leads while Mutable adapts and refines.' }
  },
  Fixed: {
    Cardinal: { score: 2, note: 'Fixed steadies Cardinal’s drive.' },
    Fixed: { score: 4, note: 'Shared fixed energy creates loyalty and endurance.' },
    Mutable: { score: 1, note: 'Fixed wants consistency while Mutable seeks variety.' }
  },
  Mutable: {
    Cardinal: { score: 3, note: 'Mutable flexes to Cardinal’s vision.' },
    Fixed: { score: 1, note: 'Mutable wants change while Fixed holds a line.' },
    Mutable: { score: 4, note: 'Shared mutable energy keeps things adaptable.' }
  }
};

const clampScore = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const compatibilityLevel = (score) => {
  if (score >= 80) return 'Cosmic Spark';
  if (score >= 65) return 'Harmonious Flow';
  if (score >= 50) return 'Balanced Orbit';
  if (score >= 35) return 'Learning Curve';
  return 'High Contrast';
};

const buildCompatibilitySummary = (primary, secondary, level) =>
  `${level} between ${primary.name} and ${secondary.name}. ${primary.element} energy meets ${secondary.element} energy with ${primary.modality.toLowerCase()} and ${secondary.modality.toLowerCase()} rhythms.`;

const buildZodiacCompatibility = (primary, secondary) => {
  let score = 50;
  const highlights = [];
  const breakdown = {};

  if (primary.name === secondary.name) {
    score += 6;
    highlights.push('Same-sign pairing amplifies shared traits.');
  }

  const elementInsight = ELEMENT_COMPATIBILITY?.[primary.element]?.[secondary.element];
  if (elementInsight) {
    score += elementInsight.score;
    breakdown.element = {
      score: elementInsight.score,
      note: elementInsight.note
    };
    highlights.push(elementInsight.note);
  }

  const modalityInsight = MODALITY_COMPATIBILITY?.[primary.modality]?.[secondary.modality];
  if (modalityInsight) {
    score += modalityInsight.score;
    breakdown.modality = {
      score: modalityInsight.score,
      note: modalityInsight.note
    };
    highlights.push(modalityInsight.note);
  }

  const mutualMatch =
    primary.compatibility.includes(secondary.name) && secondary.compatibility.includes(primary.name);
  const oneWayMatch =
    !mutualMatch &&
    (primary.compatibility.includes(secondary.name) || secondary.compatibility.includes(primary.name));
  if (mutualMatch) {
    score += 12;
    breakdown.affinity = {
      score: 12,
      note: 'Mutual favorite pairing boosts natural chemistry.'
    };
    highlights.push('Mutual favorite pairing boosts natural chemistry.');
  } else if (oneWayMatch) {
    score += 6;
    breakdown.affinity = {
      score: 6,
      note: 'One sign naturally gravitates toward the other.'
    };
    highlights.push('One sign naturally gravitates toward the other.');
  }

  if (primary.rulingPlanet === secondary.rulingPlanet) {
    score += 4;
    breakdown.rulingPlanet = {
      score: 4,
      note: `Shared ruling planet (${primary.rulingPlanet}) aligns motivations.`
    };
    highlights.push(`Shared ruling planet (${primary.rulingPlanet}) aligns motivations.`);
  }

  score = clampScore(score);
  const level = compatibilityLevel(score);

  return {
    score,
    level,
    summary: buildCompatibilitySummary(primary, secondary, level),
    highlights,
    breakdown
  };
};

function getElementRelation(me, other) {
  if (me === other) return 'Same';

  const meIdx = ELEMENTS.indexOf(me);
  const otherIdx = ELEMENTS.indexOf(other);

  // Generating: me generates other?
  if ((meIdx + 1) % 5 === otherIdx) return 'Generates';
  // Generated by: other generates me?
  if ((otherIdx + 1) % 5 === meIdx) return 'GeneratedBy';
  // Controlling: me controls other?
  if ((meIdx + 2) % 5 === otherIdx) return 'Controls';
  // Controlled by: other controls me?
  if ((otherIdx + 2) % 5 === meIdx) return 'ControlledBy';

  return 'Unknown';
}

function calculateTenGod(dayMasterStemVal, targetStemVal) {
  const dm = STEMS_MAP[dayMasterStemVal];
  const target = STEMS_MAP[targetStemVal];

  if (!dm || !target) return 'Unknown';

  const relation = getElementRelation(dm.element, target.element);
  const samePolarity = dm.polarity === target.polarity;

  switch (relation) {
    case 'Same':
      return samePolarity ? 'Friend (Bi Jian)' : 'Rob Wealth (Jie Cai)';
    case 'Generates':
      return samePolarity ? 'Eating God (Shi Shen)' : 'Hurting Officer (Shang Guan)';
    case 'GeneratedBy':
      return samePolarity ? 'Indirect Resource (Pian Yin)' : 'Direct Resource (Zheng Yin)';
    case 'Controls':
      return samePolarity ? 'Indirect Wealth (Pian Cai)' : 'Direct Wealth (Zheng Cai)';
    case 'ControlledBy':
      return samePolarity ? 'Seven Killings (Qi Sha)' : 'Direct Officer (Zheng Guan)';
    default:
      return 'Unknown';
  }
}

// Helper to map a single pillar (Gan + Zhi)
function buildPillar(ganChar, zhiChar) {
  const ganInfo = STEMS_MAP[ganChar] || { name: ganChar, element: 'Unknown' };
  const zhiInfo = BRANCHES_MAP[zhiChar] || { name: zhiChar, element: 'Unknown' };

  return {
    stem: ganInfo.name,
    branch: zhiInfo.name,
    elementStem: ganInfo.element,
    elementBranch: zhiInfo.element,
    charStem: ganChar, // Internal use
    charBranch: zhiChar // Internal use
  };
}

const authorizeToken = async (token) => {
  if (!token) throw new Error('Unauthorized');
  const parsed = parseAuthToken(token);
  if (!parsed) throw new Error('Invalid token');
  if (Date.now() - parsed.issuedAt > TOKEN_TTL_MS) {
    throw new Error('Token expired');
  }

  const now = Date.now();
  const lastSeen = sessionStore.get(token) ?? parsed.issuedAt;
  if (now - lastSeen > SESSION_IDLE_MS) {
    sessionStore.delete(token);
    throw new Error('Session expired');
  }
  sessionStore.set(token, now);

  const userId = parsed.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isAdminUser(user)
  };
};

const requireAuth = async (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  try {
    const user = await authorizeToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: error.message || 'Unauthorized' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

const serializeRecord = (record) => ({
  ...record,
  pillars: JSON.parse(record.pillars),
  fiveElements: JSON.parse(record.fiveElements),
  tenGods: record.tenGods ? JSON.parse(record.tenGods) : null,
  luckCycles: record.luckCycles ? JSON.parse(record.luckCycles) : null,
});

const parseJsonValue = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const serializeIchingRecord = (record) => ({
  ...record,
  numbers: parseJsonValue(record.numbers),
  hexagram: parseJsonValue(record.hexagram),
  resultingHexagram: parseJsonValue(record.resultingHexagram),
  changingLines: parseJsonValue(record.changingLines),
  timeContext: parseJsonValue(record.timeContext),
});

const formatTimezoneOffset = (offsetMinutes) => {
  if (!Number.isFinite(offsetMinutes)) return 'UTC';
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseTimezoneOffsetMinutes = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(utc|gmt|z)$/i.test(trimmed)) return 0;
  const match = trimmed.match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 14 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
};

const getOffsetMinutesFromTimeZone = (timeZone, date) => {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const values = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
    });
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    if (!Number.isFinite(asUtc)) return null;
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch (error) {
    return null;
  }
};

const buildBirthTimeMeta = ({
  birthYear,
  birthMonth,
  birthDay,
  birthHour,
  birthMinute,
  timezone,
  timezoneOffsetMinutes,
}) => {
  const year = Number(birthYear);
  const month = Number(birthMonth);
  const day = Number(birthDay);
  const hour = Number.isFinite(Number(birthHour)) ? Number(birthHour) : 0;
  const minute = Number.isFinite(Number(birthMinute)) ? Number(birthMinute) : 0;
  if (![year, month, day].every(Number.isFinite)) {
    return { timezoneOffsetMinutes: null, birthTimestamp: null, birthIso: null };
  }

  const offsetFromPayload = parseTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const offsetFromLabel = parseTimezoneOffsetMinutes(timezone);
  const baseUtcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetFromZone = offsetFromLabel === null ? getOffsetMinutesFromTimeZone(timezone, baseUtcDate) : null;
  const resolvedOffset = Number.isFinite(offsetFromPayload)
    ? offsetFromPayload
    : Number.isFinite(offsetFromLabel)
      ? offsetFromLabel
      : offsetFromZone;

  if (!Number.isFinite(resolvedOffset)) {
    return { timezoneOffsetMinutes: null, birthTimestamp: null, birthIso: null };
  }

  const birthTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0) - resolvedOffset * 60 * 1000;
  return {
    timezoneOffsetMinutes: resolvedOffset,
    birthTimestamp,
    birthIso: new Date(birthTimestamp).toISOString(),
  };
};

const serializeRecordWithTimezone = (record) => {
  const base = serializeRecord(record);
  const meta = buildBirthTimeMeta({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    timezone: record.timezone,
  });
  return { ...base, ...meta };
};

const getBirthSortTimestamp = (record) => {
  if (!record) return null;
  const meta = buildBirthTimeMeta({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    timezone: record.timezone,
  });
  if (Number.isFinite(meta?.birthTimestamp)) return meta.birthTimestamp;
  const year = Number(record.birthYear);
  const month = Number(record.birthMonth);
  const day = Number(record.birthDay);
  const hour = Number.isFinite(Number(record.birthHour)) ? Number(record.birthHour) : 0;
  if (![year, month, day].every(Number.isFinite)) return null;
  return Date.UTC(year, month - 1, day, hour, 0, 0);
};

const sortRecordsByBirth = (records, direction) => {
  if (!Array.isArray(records)) return records;
  const dir = direction === 'asc' ? 1 : -1;
  const keyed = records.map((record) => ({
    record,
    key: getBirthSortTimestamp(record),
    createdAt: record?.createdAt instanceof Date
      ? record.createdAt.getTime()
      : new Date(record?.createdAt ?? 0).getTime(),
    id: record?.id ?? 0,
  }));

  keyed.sort((a, b) => {
    const aFinite = Number.isFinite(a.key);
    const bFinite = Number.isFinite(b.key);
    if (aFinite && bFinite && a.key !== b.key) return (a.key - b.key) * dir;
    if (aFinite && !bFinite) return -1;
    if (!aFinite && bFinite) return 1;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return b.id - a.id;
  });

  return keyed.map((entry) => entry.record);
};

const normalizeSearchValue = (value) => (value == null ? '' : String(value).toLowerCase());

const recordMatchesQuery = (record, queryLower) => {
  if (!queryLower) return true;
  return [
    record.birthLocation,
    record.timezone,
    record.gender,
    record.pillars,
  ].some((field) => normalizeSearchValue(field).includes(queryLower));
};

const parseJsonField = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value;
  return null;
};

const coerceInt = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
};

const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
};

const validateBaziInput = (raw) => {
  const birthYear = Number(raw?.birthYear);
  const birthMonth = Number(raw?.birthMonth);
  const birthDay = Number(raw?.birthDay);
  const birthHour = Number(raw?.birthHour);
  const genderRaw = raw?.gender;
  const gender = typeof genderRaw === 'string' ? genderRaw.trim() : '';
  const birthLocationRaw = raw?.birthLocation;
  const timezoneRaw = raw?.timezone;
  if (isWhitespaceOnly(genderRaw) || isWhitespaceOnly(birthLocationRaw) || isWhitespaceOnly(timezoneRaw)) {
    return { ok: false, payload: null, reason: 'whitespace' };
  }
  const birthLocation = typeof birthLocationRaw === 'string' ? birthLocationRaw.trim() : birthLocationRaw;
  const timezone = typeof timezoneRaw === 'string' ? timezoneRaw.trim() : timezoneRaw;

  if (
    !Number.isInteger(birthYear)
    || birthYear < 1
    || birthYear > 9999
    || !Number.isInteger(birthMonth)
    || birthMonth < 1
    || birthMonth > 12
    || !Number.isInteger(birthDay)
    || birthDay < 1
    || birthDay > 31
    || !Number.isInteger(birthHour)
    || birthHour < 0
    || birthHour > 23
    || !gender
    || !isValidCalendarDate(birthYear, birthMonth, birthDay)
  ) {
    return { ok: false, payload: null, reason: 'invalid' };
  }

  return {
    ok: true,
    payload: {
      ...raw,
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
      birthLocation,
      timezone,
    },
  };
};

const BAZI_CACHE_TTL_MS = Number(process.env.BAZI_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const BAZI_CACHE_MAX_ENTRIES = Number(process.env.BAZI_CACHE_MAX_ENTRIES || 500);
const baziCalculationCache = new Map();

const buildBaziCacheKey = (data) => {
  if (!data) return null;
  const birthYear = coerceInt(data.birthYear);
  const birthMonth = coerceInt(data.birthMonth);
  const birthDay = coerceInt(data.birthDay);
  const birthHour = coerceInt(data.birthHour);
  const gender =
    typeof data.gender === 'string' ? data.gender.trim().toLowerCase() : null;

  if (
    birthYear === null
    || birthMonth === null
    || birthDay === null
    || birthHour === null
    || !gender
  ) {
    return null;
  }

  return `${birthYear}-${birthMonth}-${birthDay}-${birthHour}-${gender}`;
};

const buildFiveElementsPercent = (fiveElements) => {
  if (!fiveElements || typeof fiveElements !== 'object') return null;
  const total = Object.values(fiveElements).reduce((sum, value) => {
    const next = Number(value);
    return sum + (Number.isFinite(next) ? next : 0);
  }, 0);

  return ELEMENTS.reduce((acc, element) => {
    const raw = Number(fiveElements[element]);
    const safe = Number.isFinite(raw) ? raw : 0;
    acc[element] = total ? Math.round((safe / total) * 100) : 0;
    return acc;
  }, {});
};

const normalizeBaziResult = (result) => {
  if (!result || typeof result !== 'object') return result;
  if (result.fiveElementsPercent || !result.fiveElements) return result;
  const fiveElementsPercent = buildFiveElementsPercent(result.fiveElements);
  if (!fiveElementsPercent) return result;
  return { ...result, fiveElementsPercent };
};

const pruneBaziCache = () => {
  if (!Number.isFinite(BAZI_CACHE_MAX_ENTRIES) || BAZI_CACHE_MAX_ENTRIES <= 0) {
    return;
  }
  while (baziCalculationCache.size > BAZI_CACHE_MAX_ENTRIES) {
    const oldestKey = baziCalculationCache.keys().next().value;
    if (!oldestKey) break;
    baziCalculationCache.delete(oldestKey);
  }
};

const getCachedBaziCalculation = (key) => {
  if (!key) return null;
  const entry = baziCalculationCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    baziCalculationCache.delete(key);
    return null;
  }
  // Refresh LRU position
  baziCalculationCache.delete(key);
  baziCalculationCache.set(key, entry);
  return entry.value;
};

const setBaziCacheEntry = (key, value) => {
  if (!key) return;
  const normalized = normalizeBaziResult(value);
  const expiresAt = Number.isFinite(BAZI_CACHE_TTL_MS) && BAZI_CACHE_TTL_MS > 0
    ? Date.now() + BAZI_CACHE_TTL_MS
    : null;
  if (baziCalculationCache.has(key)) {
    baziCalculationCache.delete(key);
  }
  baziCalculationCache.set(key, { value: normalized, expiresAt });
  pruneBaziCache();
};

const primeBaziCalculationCache = (data, result) => {
  const key = buildBaziCacheKey(data);
  if (!key || !result) return;
  setBaziCacheEntry(key, result);
};

const invalidateBaziCalculationCache = (data) => {
  const key = typeof data === 'string' ? data : buildBaziCacheKey(data);
  if (!key) return;
  baziCalculationCache.delete(key);
};

const buildImportRecord = (raw, userId) => {
  if (!raw || typeof raw !== 'object') return null;
  const birthYear = coerceInt(raw.birthYear);
  const birthMonth = coerceInt(raw.birthMonth);
  const birthDay = coerceInt(raw.birthDay);
  const birthHour = coerceInt(raw.birthHour);
  const gender = typeof raw.gender === 'string' ? raw.gender.trim() : '';
  if (!birthYear || !birthMonth || !birthDay || birthHour === null || !gender) return null;

  let pillars = parseJsonField(raw.pillars);
  let fiveElements = parseJsonField(raw.fiveElements);
  let tenGods = parseJsonField(raw.tenGods);
  let luckCycles = parseJsonField(raw.luckCycles);

  if (!pillars || !fiveElements) {
    const computed = getBaziCalculation({ birthYear, birthMonth, birthDay, birthHour, gender });
    if (!pillars) pillars = computed.pillars;
    if (!fiveElements) fiveElements = computed.fiveElements;
    if (!tenGods) tenGods = computed.tenGods;
    if (!luckCycles) luckCycles = computed.luckCycles;
  }
  primeBaziCalculationCache(
    { birthYear, birthMonth, birthDay, birthHour, gender },
    { pillars, fiveElements, tenGods, luckCycles }
  );

  const createdAtRaw = raw.createdAt ? new Date(raw.createdAt) : null;
  const createdAt = createdAtRaw && !Number.isNaN(createdAtRaw.getTime()) ? createdAtRaw : null;

  const timezoneOffset = parseTimezoneOffsetMinutes(raw.timezoneOffsetMinutes);
  const timezoneFallback = Number.isFinite(timezoneOffset)
    ? formatTimezoneOffset(timezoneOffset)
    : null;

  const record = {
    userId,
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
    birthLocation: typeof raw.birthLocation === 'string' ? raw.birthLocation : null,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : timezoneFallback,
    pillars: JSON.stringify(pillars),
    fiveElements: JSON.stringify(fiveElements),
    tenGods: tenGods ? JSON.stringify(tenGods) : null,
    luckCycles: luckCycles ? JSON.stringify(luckCycles) : null,
  };

  if (createdAt) record.createdAt = createdAt;
  return record;
};

const parseIdParam = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
};

// --- I Ching Helpers ---

const normalizeNumber = (value, modulo) => {
  const safe = Math.abs(Number(value));
  if (!Number.isFinite(safe)) return null;
  const remainder = safe % modulo;
  return remainder === 0 ? modulo : remainder;
};

const pickTrigram = (value) => {
  const index = normalizeNumber(value, 8);
  if (!index) return null;
  return TRIGRAMS[index - 1];
};

const buildHexagram = (upper, lower) => {
  if (!upper || !lower) return null;
  return hexagramByTrigrams.get(`${upper.id}-${lower.id}`) || null;
};

const applyChangingLines = (hexagram, changingLines = []) => {
  if (!hexagram || !changingLines.length) return hexagram;
  const nextLines = [...hexagram.lines];
  changingLines.forEach((line) => {
    const index = Math.min(Math.max(line, 1), 6) - 1;
    nextLines[index] = nextLines[index] ? 0 : 1;
  });
  return hexagramByLines.get(nextLines.join('')) || { ...hexagram, lines: nextLines };
};

// --- Core Calculation ---

const performCalculation = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = data;

  // Create Solar date. Lunar-javascript expects month 1-12.
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  // 1. Pillars
  const yearPillar = buildPillar(eightChar.getYearGan(), eightChar.getYearZhi());
  const monthPillar = buildPillar(eightChar.getMonthGan(), eightChar.getMonthZhi());
  const dayPillar = buildPillar(eightChar.getDayGan(), eightChar.getDayZhi());
  const hourPillar = buildPillar(eightChar.getTimeGan(), eightChar.getTimeZhi());

  const pillars = {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
  };

  // 2. Five Elements Count
  // Count elements from Stems and Branches
  const counts = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  const addCount = (el) => { if (counts[el] !== undefined) counts[el]++; };

  [yearPillar, monthPillar, dayPillar, hourPillar].forEach(p => {
    addCount(p.elementStem);
    addCount(p.elementBranch);
  });
  const totalElements = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const fiveElementsPercent = ELEMENTS.reduce((acc, element) => {
    acc[element] = totalElements ? Math.round((counts[element] / totalElements) * 100) : 0;
    return acc;
  }, {});

  // 3. Ten Gods (Stems relative to Day Master)
  // We calculate Ten Gods for the generated Stems (Year, Month, Hour) relative to Day Stem.
  // We can also calculate for Branch Main Qi if we want, but for now stick to simple structure.
  // The frontend expects a list of { name, strength }.
  // Current logic in frontend is displaying them as a list.
  // We will provide a list of Ten Gods present in the Stems? Or all 10 types?
  // The previous mock returned all 10 types with strengths.
  // To be helpful, we can calculate the strength based on how many times that Ten God appears (simplified).

  const dayMasterChar = eightChar.getDayGan();
  const tenGodsCounts = {};

  // Initialize counts
  const allTenGodsTypes = [
    'Friend (Bi Jian)', 'Rob Wealth (Jie Cai)',
    'Eating God (Shi Shen)', 'Hurting Officer (Shang Guan)',
    'Indirect Wealth (Pian Cai)', 'Direct Wealth (Zheng Cai)',
    'Seven Killings (Qi Sha)', 'Direct Officer (Zheng Guan)',
    'Indirect Resource (Pian Yin)', 'Direct Resource (Zheng Yin)'
  ];
  allTenGodsTypes.forEach(t => tenGodsCounts[t] = 0);

  // Scan all stems and branches to count Ten Gods
  // For stems: direct relationship
  // For branches: use the main element/hidden stem? Simplified: use branch element.

  const scanParts = [
    yearPillar.charStem, yearPillar.charBranch,
    monthPillar.charStem, monthPillar.charBranch,
    // dayPillar.charStem is Self (Day Master), usually not counted as Ten God or counted as Friend?
    // Usually Day Master is not its own Ten God.
    dayPillar.charBranch,
    hourPillar.charStem, hourPillar.charBranch
  ];

  // Helper to get element of char to find pseudo-TenGod for Branch
  const getCharStemEquivalent = (char) => {
    // If it is a Stem, return it.
    if (STEMS_MAP[char]) return char;
    // If Branch, convert to Main Qi Stem (Simplified)
    // This is a rough approximation for the strength chart.
    const branchToMainQi = {
      '子': '癸', '丑': '己', '寅': '甲', '卯': '乙', '辰': '戊', '巳': '丙',
      '午': '丁', '未': '己', '申': '庚', '酉': '辛', '戌': '戊', '亥': '壬'
    };
    return branchToMainQi[char];
  };

  scanParts.forEach(char => {
    const stemVal = getCharStemEquivalent(char);
    if (stemVal) {
      const tg = calculateTenGod(dayMasterChar, stemVal);
      if (tenGodsCounts[tg] !== undefined) {
        tenGodsCounts[tg] += 10; // Add score
      } else if (tg.includes('Friend')) {
        // Self
        tenGodsCounts['Friend (Bi Jian)'] += 10;
      }
    }
  });

  // Map to array
  const tenGods = Object.entries(tenGodsCounts).map(([name, val]) => ({
    name, strength: val
  }));

  // 4. Luck Cycles (Da Yun)
  // lunar-javascript: gender 1=man, 0=woman
  const genderInt = gender === 'male' ? 1 : 0;
  const yun = eightChar.getYun(genderInt);
  const daYunArr = yun.getDaYun();

  // We usually take first 8-10 cycles
  // DaYun object has: getStartYear(), getStartAge(), getGanZhi()
  const luckCycles = daYunArr.slice(1, 9).map((dy) => { // Start from index 1 usually as index 0 is 0-agg
    const startAge = dy.getStartAge();
    const endAge = dy.getEndAge();
    const startYear = typeof dy.getStartYear === 'function' ? dy.getStartYear() : null;
    const endYear = typeof dy.getEndYear === 'function' ? dy.getEndYear() : null;
    const ganZhi = dy.getGanZhi();
    // Split GanZhi (e.g. "甲子")
    const gan = ganZhi.substring(0, 1);
    const zhi = ganZhi.substring(1, 2);
    const stemInfo = STEMS_MAP[gan] || { name: gan };
    const zhiInfo = BRANCHES_MAP[zhi] || { name: zhi };

    return {
      range: `${startAge}-${endAge}`,
      stem: stemInfo.name,
      branch: zhiInfo.name,
      startYear,
      endYear
    };
  });

  return { pillars, fiveElements: counts, fiveElementsPercent, tenGods, luckCycles };
};

const getBaziCalculation = (data, { bypassCache = false } = {}) => {
  const cacheKey = buildBaziCacheKey(data);
  if (!bypassCache && cacheKey) {
    const cached = getCachedBaziCalculation(cacheKey);
    if (cached) return cached;
  }
  const result = performCalculation(data);
  if (cacheKey) setBaziCacheEntry(cacheKey, result);
  return result;
};

// --- Ziwei (V2) Calculation ---
const ZIWEI_BRANCH_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZIWEI_MONTH_BRANCH_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const ZIWEI_PALACES = [
  { key: 'ming', name: 'Ming', cn: '命宫' },
  { key: 'brothers', name: 'Brothers', cn: '兄弟' },
  { key: 'spouse', name: 'Spouse', cn: '夫妻' },
  { key: 'children', name: 'Children', cn: '子女' },
  { key: 'wealth', name: 'Wealth', cn: '财帛' },
  { key: 'health', name: 'Health', cn: '疾厄' },
  { key: 'travel', name: 'Travel', cn: '迁移' },
  { key: 'friends', name: 'Friends', cn: '仆役' },
  { key: 'career', name: 'Career', cn: '官禄' },
  { key: 'property', name: 'Property', cn: '田宅' },
  { key: 'mental', name: 'Mental', cn: '福德' },
  { key: 'parents', name: 'Parents', cn: '父母' },
];

const ZIWEI_MAJOR_STARS = {
  ziwei: { key: 'ziwei', name: 'Zi Wei', cn: '紫微' },
  tianji: { key: 'tianji', name: 'Tian Ji', cn: '天机' },
  taiyang: { key: 'taiyang', name: 'Tai Yang', cn: '太阳' },
  wuqu: { key: 'wuqu', name: 'Wu Qu', cn: '武曲' },
  tiantong: { key: 'tiantong', name: 'Tian Tong', cn: '天同' },
  lianzhen: { key: 'lianzhen', name: 'Lian Zhen', cn: '廉贞' },
  tianfu: { key: 'tianfu', name: 'Tian Fu', cn: '天府' },
  taiyin: { key: 'taiyin', name: 'Tai Yin', cn: '太阴' },
  tanlang: { key: 'tanlang', name: 'Tan Lang', cn: '贪狼' },
  jumen: { key: 'jumen', name: 'Ju Men', cn: '巨门' },
  tianxiang: { key: 'tianxiang', name: 'Tian Xiang', cn: '天相' },
  tianliang: { key: 'tianliang', name: 'Tian Liang', cn: '天梁' },
  qisha: { key: 'qisha', name: 'Qi Sha', cn: '七杀' },
  pojun: { key: 'pojun', name: 'Po Jun', cn: '破军' },
};

const ZIWEI_MINOR_STARS = {
  wenchang: { key: 'wenchang', name: 'Wen Chang', cn: '文昌' },
  wenqu: { key: 'wenqu', name: 'Wen Qu', cn: '文曲' },
  zuofu: { key: 'zuofu', name: 'Zuo Fu', cn: '左辅' },
  youbi: { key: 'youbi', name: 'You Bi', cn: '右弼' },
  huoxing: { key: 'huoxing', name: 'Huo Xing', cn: '火星' },
  lingxing: { key: 'lingxing', name: 'Ling Xing', cn: '铃星' },
  tiankui: { key: 'tiankui', name: 'Tian Kui', cn: '天魁' },
  tianyue: { key: 'tianyue', name: 'Tian Yue', cn: '天钺' },
};

const ZIWEI_SIHUA_BY_STEM = {
  '甲': { lu: 'lianzhen', quan: 'pojun', ke: 'wuqu', ji: 'taiyang' },
  '乙': { lu: 'tianji', quan: 'tianliang', ke: 'ziwei', ji: 'taiyin' },
  '丙': { lu: 'tiantong', quan: 'tianji', ke: 'wenchang', ji: 'lianzhen' },
  '丁': { lu: 'taiyin', quan: 'tiantong', ke: 'tianji', ji: 'jumen' },
  '戊': { lu: 'tanlang', quan: 'taiyin', ke: 'youbi', ji: 'tianji' },
  '己': { lu: 'wuqu', quan: 'tanlang', ke: 'tianliang', ji: 'wenqu' },
  '庚': { lu: 'taiyang', quan: 'wuqu', ke: 'taiyin', ji: 'tiantong' },
  '辛': { lu: 'jumen', quan: 'taiyang', ke: 'wenqu', ji: 'wenchang' },
  '壬': { lu: 'tianliang', quan: 'ziwei', ke: 'tianji', ji: 'pojun' },
  '癸': { lu: 'pojun', quan: 'jumen', ke: 'taiyin', ji: 'tanlang' },
};

const normalizeIndex = (value, modulo = 12) => ((value % modulo) + modulo) % modulo;

const getTimeBranchIndex = (birthHour) => {
  const hour = Number(birthHour);
  if (!Number.isFinite(hour)) return 0;
  return Math.floor((hour + 1) / 2) % 12;
};

const buildZiweiPalaces = (mingIndex) => {
  const palaces = ZIWEI_BRANCH_ORDER.map((branch, index) => ({
    index,
    branch: {
      key: branch,
      name: BRANCHES_MAP[branch]?.name || branch,
      element: BRANCHES_MAP[branch]?.element || 'Unknown',
      polarity: BRANCHES_MAP[branch]?.polarity || null,
    },
    palace: null,
    stars: { major: [], minor: [] },
    transformations: [],
  }));

  ZIWEI_PALACES.forEach((palace, offset) => {
    const index = normalizeIndex(mingIndex + offset);
    palaces[index].palace = palace;
  });

  return palaces;
};

const calculateZiweiChart = (data) => {
  const { birthYear, birthMonth, birthDay, birthHour } = data;
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, birthHour || 0, 0, 0);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const lunarMonth = lunar.getMonth();
  const lunarDay = lunar.getDay();
  const lunarYear = lunar.getYear();
  const isLeapMonth = typeof lunar.isLeap === 'function' ? lunar.isLeap() : Boolean(lunar.isLeap);

  const monthBranch = ZIWEI_MONTH_BRANCH_ORDER[normalizeIndex(lunarMonth - 1)];
  const monthBranchIndex = ZIWEI_BRANCH_ORDER.indexOf(monthBranch);
  const timeBranchIndex = getTimeBranchIndex(birthHour);

  const mingIndex = normalizeIndex(monthBranchIndex - timeBranchIndex);
  const shenIndex = normalizeIndex(monthBranchIndex + timeBranchIndex);

  const ziweiIndex = normalizeIndex(monthBranchIndex + (lunarDay - 1));
  const tianfuIndex = normalizeIndex(ziweiIndex + 6);

  const palaces = buildZiweiPalaces(mingIndex);

  const transformMap = ZIWEI_SIHUA_BY_STEM[eightChar.getYearGan()] || {};
  const transformByStarKey = Object.values(transformMap).reduce((acc, key) => {
    if (key) acc[key] = acc[key] || [];
    return acc;
  }, {});
  Object.entries(transformMap).forEach(([type, key]) => {
    if (!key) return;
    if (!transformByStarKey[key]) transformByStarKey[key] = [];
    transformByStarKey[key].push(type);
  });

  const addStar = (index, star, group) => {
    if (!star) return;
    const target = palaces[index];
    if (!target) return;
    const transforms = transformByStarKey[star.key] || [];
    const entry = transforms.length
      ? { ...star, transforms }
      : { ...star };
    target.stars[group].push(entry);
    if (transforms.length) {
      transforms.forEach((type) => {
        target.transformations.push({ type, starKey: star.key, starName: star.name, starCn: star.cn });
      });
    }
  };

  const ziweiGroup = [
    { star: ZIWEI_MAJOR_STARS.ziwei, offset: 0 },
    { star: ZIWEI_MAJOR_STARS.tianji, offset: 1 },
    { star: ZIWEI_MAJOR_STARS.taiyang, offset: 3 },
    { star: ZIWEI_MAJOR_STARS.wuqu, offset: 4 },
    { star: ZIWEI_MAJOR_STARS.tiantong, offset: 5 },
    { star: ZIWEI_MAJOR_STARS.lianzhen, offset: 6 },
  ];

  const tianfuGroup = [
    { star: ZIWEI_MAJOR_STARS.tianfu, offset: 0 },
    { star: ZIWEI_MAJOR_STARS.taiyin, offset: 1 },
    { star: ZIWEI_MAJOR_STARS.tanlang, offset: 2 },
    { star: ZIWEI_MAJOR_STARS.jumen, offset: 3 },
    { star: ZIWEI_MAJOR_STARS.tianxiang, offset: 4 },
    { star: ZIWEI_MAJOR_STARS.tianliang, offset: 5 },
    { star: ZIWEI_MAJOR_STARS.qisha, offset: 6 },
    { star: ZIWEI_MAJOR_STARS.pojun, offset: 7 },
  ];

  ziweiGroup.forEach(({ star, offset }) => addStar(normalizeIndex(ziweiIndex + offset), star, 'major'));
  tianfuGroup.forEach(({ star, offset }) => addStar(normalizeIndex(tianfuIndex + offset), star, 'major'));

  const minorBase = normalizeIndex(lunarDay + timeBranchIndex);
  const minorGroup = [
    { star: ZIWEI_MINOR_STARS.wenchang, offset: 0 },
    { star: ZIWEI_MINOR_STARS.wenqu, offset: 4 },
    { star: ZIWEI_MINOR_STARS.zuofu, offset: 6 },
    { star: ZIWEI_MINOR_STARS.youbi, offset: 10 },
    { star: ZIWEI_MINOR_STARS.huoxing, offset: 2 },
    { star: ZIWEI_MINOR_STARS.lingxing, offset: 8 },
    { star: ZIWEI_MINOR_STARS.tiankui, offset: 1 },
    { star: ZIWEI_MINOR_STARS.tianyue, offset: 7 },
  ];
  minorGroup.forEach(({ star, offset }) => addStar(normalizeIndex(minorBase + offset), star, 'minor'));

  const transformations = Object.entries(transformMap).map(([type, starKey]) => {
    const starDef = ZIWEI_MAJOR_STARS[starKey] || ZIWEI_MINOR_STARS[starKey] || { key: starKey };
    return {
      type,
      starKey,
      starName: starDef.name || starKey,
      starCn: starDef.cn || null,
    };
  });

  return {
    lunar: {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap: isLeapMonth,
      yearStem: eightChar.getYearGan(),
      yearBranch: eightChar.getYearZhi(),
      monthStem: eightChar.getMonthGan(),
      monthBranch: eightChar.getMonthZhi(),
      dayStem: eightChar.getDayGan(),
      dayBranch: eightChar.getDayZhi(),
      timeStem: eightChar.getTimeGan(),
      timeBranch: eightChar.getTimeZhi(),
    },
    mingPalace: {
      index: mingIndex,
      branch: palaces[mingIndex]?.branch,
      palace: palaces[mingIndex]?.palace,
    },
    shenPalace: {
      index: shenIndex,
      branch: palaces[shenIndex]?.branch,
      palace: palaces[shenIndex]?.palace,
    },
    fourTransformations: transformations,
    palaces,
  };
};

// --- Routes ---

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/ai/providers', (req, res) => {
  res.json({
    activeProvider: AI_PROVIDER,
    providers: AVAILABLE_PROVIDERS
  });
});

app.get('/api/zodiac/:sign', (req, res) => {
  const signKey = normalizeSign(req.params.sign);
  const sign = ZODIAC_SIGNS[signKey];
  if (!sign) return res.status(404).json({ error: 'Unknown sign' });

  res.json({ sign: { key: signKey, ...sign } });
});

app.post('/api/zodiac/rising', (req, res) => {
  const { birthDate, birthTime, latitude, longitude, timezoneOffsetMinutes } = req.body || {};

  if (!birthDate || !birthTime || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Birth date, time, latitude, and longitude are required.' });
  }

  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [birthHour, birthMinute] = birthTime.split(':').map(Number);
  const lat = Number(latitude);
  const lon = Number(longitude);
  const tzOffset = Number(timezoneOffsetMinutes);

  if (![birthYear, birthMonth, birthDay, birthHour, birthMinute].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Invalid birth date or time.' });
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Latitude must be between -90 and 90.' });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Longitude must be between -180 and 180.' });
  }
  if (!Number.isFinite(tzOffset) || tzOffset < -14 * 60 || tzOffset > 14 * 60) {
    return res.status(400).json({ error: 'Timezone offset must be between -14 and 14 hours.' });
  }

  try {
    const { signKey, ascendant } = calculateRisingSign({
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      birthMinute,
      latitude: lat,
      longitude: lon,
      timezoneOffsetMinutes: tzOffset
    });
    const sign = ZODIAC_SIGNS[signKey];
    res.json({
      rising: { key: signKey, ...sign },
      ascendant
    });
  } catch (error) {
    console.error('Rising sign error:', error);
    res.status(500).json({ error: 'Unable to calculate rising sign.' });
  }
});

app.get('/api/zodiac/:sign/horoscope', (req, res) => {
  const signKey = normalizeSign(req.params.sign);
  const sign = ZODIAC_SIGNS[signKey];
  if (!sign) return res.status(404).json({ error: 'Unknown sign' });

  const period = sanitizeQueryParam(req.query.period) || 'daily';
  if (!ZODIAC_PERIODS.has(period)) {
    return res.status(400).json({ error: 'Invalid period. Use daily, weekly, or monthly.' });
  }

  const horoscope = buildHoroscope(sign, period);
  res.json({
    sign: { key: signKey, ...sign },
    period,
    range:
      period === 'daily'
        ? formatDateLabel(new Date(), { month: 'short', day: 'numeric', year: 'numeric' })
        : period === 'weekly'
          ? getWeekRange(new Date())
          : formatDateLabel(new Date(), { month: 'long', year: 'numeric' }),
    generatedAt: new Date().toISOString(),
    horoscope
  });
});

app.get('/api/zodiac/compatibility', (req, res) => {
  const primaryKey = sanitizeQueryParam(req.query.primary);
  const secondaryKey = sanitizeQueryParam(req.query.secondary);

  if (!primaryKey || !secondaryKey) {
    return res.status(400).json({ error: 'Provide primary and secondary signs.' });
  }

  const primary = ZODIAC_SIGNS[primaryKey];
  const secondary = ZODIAC_SIGNS[secondaryKey];

  if (!primary || !secondary) {
    return res.status(404).json({ error: 'Unknown sign provided.' });
  }

  const compatibility = buildZodiacCompatibility(primary, secondary);

  res.json({
    primary: { key: primaryKey, ...primary },
    secondary: { key: secondaryKey, ...secondary },
    ...compatibility
  });
});

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const nextPath = sanitizeNextPath(req.query.next);
  const state = buildOauthState(nextPath);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;

  if (oauthError) {
    const redirectUrl = buildOauthRedirectUrl({ error: oauthError });
    return res.redirect(redirectUrl);
  }

  if (!code || !state) {
    const redirectUrl = buildOauthRedirectUrl({ error: 'missing_code' });
    return res.redirect(redirectUrl);
  }

  const stateEntry = consumeOauthState(state);
  if (!stateEntry) {
    const redirectUrl = buildOauthRedirectUrl({ error: 'invalid_state' });
    return res.redirect(redirectUrl);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const redirectUrl = buildOauthRedirectUrl({ error: 'not_configured', nextPath: stateEntry.nextPath });
    return res.redirect(redirectUrl);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error('Google token exchange failed:', tokenRes.status, detail);
      const redirectUrl = buildOauthRedirectUrl({
        error: 'token_exchange_failed',
        nextPath: stateEntry.nextPath,
      });
      return res.redirect(redirectUrl);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      const redirectUrl = buildOauthRedirectUrl({
        error: 'missing_access_token',
        nextPath: stateEntry.nextPath,
      });
      return res.redirect(redirectUrl);
    }

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const detail = await profileRes.text();
      console.error('Google profile fetch failed:', profileRes.status, detail);
      const redirectUrl = buildOauthRedirectUrl({
        error: 'profile_fetch_failed',
        nextPath: stateEntry.nextPath,
      });
      return res.redirect(redirectUrl);
    }

    const profile = await profileRes.json();
    const email = profile?.email;
    if (!email) {
      const redirectUrl = buildOauthRedirectUrl({ error: 'missing_email', nextPath: stateEntry.nextPath });
      return res.redirect(redirectUrl);
    }

    const displayName =
      profile?.name
      || profile?.given_name
      || profile?.family_name
      || email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await prisma.user.create({
        data: { email, name: displayName, password: randomPassword },
      });
    } else if (!user.name && displayName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: displayName },
      });
    }

    const token = `token_${user.id}_${Date.now()}`;
    sessionStore.set(token, Date.now());

    const redirectUrl = buildOauthRedirectUrl({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      nextPath: stateEntry.nextPath,
    });
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const redirectUrl = buildOauthRedirectUrl({ error: 'server_error', nextPath: stateEntry.nextPath });
    return res.redirect(redirectUrl);
  }
});

app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const user = await prisma.user.create({ data: { email, password, name } });
    res.json({ message: 'User created', user });
  } catch (error) {
    if (error.code === 'P2002') res.status(409).json({ error: 'Email already exists' });
    else { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Login failed' });
    }
    const token = `token_${user.id}_${Date.now()}`;
    sessionStore.set(token, Date.now());
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: isAdminUser(user)
      }
    });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/auth/wechat/redirect', (req, res) => {
  if (!WECHAT_APP_ID) {
    return res.status(500).json({ error: 'WeChat OAuth not configured' });
  }
  const redirectPath = sanitizeNextPath(req.query?.next) || '/profile';
  const state = createWeChatState(redirectPath);
  const redirectUri = encodeURIComponent(WECHAT_REDIRECT_URI);
  const scope = encodeURIComponent(WECHAT_SCOPE);
  const wechatUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;
  res.redirect(wechatUrl);
});

app.get('/api/auth/wechat/callback', async (req, res) => {
  const code = typeof req.query?.code === 'string' ? req.query.code : null;
  const state = typeof req.query?.state === 'string' ? req.query.state : null;

  const redirectToFrontend = (params) => {
    const target = new URL('/login', WECHAT_FRONTEND_URL);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        target.searchParams.set(key, String(value));
      }
    });
    res.redirect(target.toString());
  };

  if (!code || !state) {
    return redirectToFrontend({ error: 'wechat_missing_params', provider: 'wechat' });
  }
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    return redirectToFrontend({ error: 'wechat_not_configured', provider: 'wechat' });
  }
  const redirectPath = consumeWeChatState(state);
  if (!redirectPath) {
    return redirectToFrontend({ error: 'wechat_invalid_state', provider: 'wechat' });
  }

  try {
    const tokenRes = await fetchWithTimeout(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`,
      { method: 'GET' },
      10000
    );
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('WeChat token error:', text);
      return redirectToFrontend({ error: 'wechat_token_failed', provider: 'wechat' });
    }
    const tokenData = await tokenRes.json();
    if (tokenData?.errcode) {
      console.error('WeChat token response error:', tokenData);
      return redirectToFrontend({ error: 'wechat_token_failed', provider: 'wechat' });
    }

    let profile = null;
    if (tokenData?.access_token && tokenData?.openid) {
      const profileRes = await fetchWithTimeout(
        `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}&lang=zh_CN`,
        { method: 'GET' },
        10000
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (!profileData?.errcode) {
          profile = profileData;
        }
      }
    }

    const openId = tokenData?.openid;
    if (!openId) {
      return redirectToFrontend({ error: 'wechat_missing_openid', provider: 'wechat' });
    }
    const email = `wechat_${openId}@wechat.local`;
    const displayName = profile?.nickname || 'WeChat User';

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          password: crypto.randomBytes(16).toString('hex'),
          name: displayName,
        },
      });
    } else if (!user.name && displayName) {
      user = await prisma.user.update({
        where: { email },
        data: { name: displayName },
      });
    }

    const token = `token_${user.id}_${Date.now()}`;
    sessionStore.set(token, Date.now());

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: isAdminUser(user),
    };
    const encodedUser = Buffer.from(JSON.stringify(userPayload)).toString('base64url');
    return redirectToFrontend({
      token,
      user: encodedUser,
      next: redirectPath,
      provider: 'wechat',
    });
  } catch (error) {
    console.error('WeChat OAuth error:', error);
    return redirectToFrontend({ error: 'wechat_oauth_failed', provider: 'wechat' });
  }
});

app.post('/api/password/request', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = createResetToken(user.id);
      console.log(`[password-reset] Reset token for ${user.email}: ${token}`);
    }
  } catch (error) {
    console.error('Password reset request error:', error);
  }

  res.json({
    message: 'If an account exists for that email, a reset link has been sent.'
  });
});

app.post('/api/password/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }

  const userId = consumeResetToken(token);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { password } });
    return res.json({ message: 'Password updated' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Unable to reset password' });
  }
});

app.get('/api/user/settings', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    const etag = buildSettingsEtag(row);
    if (etag) {
      res.set('ETag', etag);
    }
    res.json({
      settings: {
        locale: row?.locale ?? null,
        preferences: parsePreferences(row?.preferences),
        updatedAt: row?.updatedAt ?? null,
      },
      etag,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/user/settings', requireAuth, async (req, res) => {
  const { locale, preferences } = req.body || {};
  if (locale !== undefined && typeof locale !== 'string') {
    return res.status(400).json({ error: 'Invalid locale' });
  }
  if (preferences !== undefined && (typeof preferences !== 'object' || Array.isArray(preferences))) {
    return res.status(400).json({ error: 'Invalid preferences' });
  }

  try {
    const expectedUpdatedAt =
      typeof req.body?.expectedUpdatedAt === 'string' ? req.body.expectedUpdatedAt : null;
    const ifMatchValue = parseIfMatchHeader(req.headers['if-match']);
    const rows = await prisma.$queryRaw`
      SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    const currentEtag = buildSettingsEtag(row);
    const hasRow = Boolean(row);
    if (ifMatchValue === '*' && !hasRow) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: null,
        etag: null,
      });
    }
    if (ifMatchValue && ifMatchValue !== '*' && (!hasRow || ifMatchValue !== row.updatedAt)) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: {
          locale: row?.locale ?? null,
          preferences: parsePreferences(row?.preferences),
          updatedAt: row?.updatedAt ?? null,
        },
        etag: currentEtag,
      });
    }
    if (expectedUpdatedAt && (!hasRow || expectedUpdatedAt !== row.updatedAt)) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: {
          locale: row?.locale ?? null,
          preferences: parsePreferences(row?.preferences),
          updatedAt: row?.updatedAt ?? null,
        },
        etag: currentEtag,
      });
    }

    const existingPreferences = parsePreferences(row?.preferences);
    const nextLocale = typeof locale === 'string' ? locale : row?.locale ?? null;
    const nextPreferences = preferences ?? existingPreferences ?? null;
    const preferencesJson = nextPreferences ? JSON.stringify(nextPreferences) : null;
    const requiresExisting = ifMatchValue === '*' || Boolean(expectedUpdatedAt) || Boolean(ifMatchValue);

    if (requiresExisting && !hasRow) {
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: null,
        etag: null,
      });
    }

    const expectedMatch =
      expectedUpdatedAt || (ifMatchValue && ifMatchValue !== '*' ? ifMatchValue : null);

    const updateResult = expectedMatch
      ? await prisma.$executeRaw`
          INSERT INTO UserSettings (userId, locale, preferences, createdAt, updatedAt)
          VALUES (${req.user.id}, ${nextLocale}, ${preferencesJson}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(userId)
          DO UPDATE SET locale = excluded.locale, preferences = excluded.preferences, updatedAt = CURRENT_TIMESTAMP
          WHERE UserSettings.updatedAt = ${expectedMatch}
        `
      : await prisma.$executeRaw`
          INSERT INTO UserSettings (userId, locale, preferences, createdAt, updatedAt)
          VALUES (${req.user.id}, ${nextLocale}, ${preferencesJson}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(userId)
          DO UPDATE SET locale = excluded.locale, preferences = excluded.preferences, updatedAt = CURRENT_TIMESTAMP
        `;

    if (expectedMatch && updateResult === 0) {
      const refreshRows = await prisma.$queryRaw`
        SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
      `;
      const refreshRow = Array.isArray(refreshRows) ? refreshRows[0] : null;
      const refreshEtag = buildSettingsEtag(refreshRow);
      return res.status(409).json({
        error: 'Settings have changed. Please refresh and try again.',
        settings: {
          locale: refreshRow?.locale ?? null,
          preferences: parsePreferences(refreshRow?.preferences),
          updatedAt: refreshRow?.updatedAt ?? null,
        },
        etag: refreshEtag,
      });
    }

    const updatedRows = await prisma.$queryRaw`
      SELECT locale, preferences, updatedAt FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const updatedRow = Array.isArray(updatedRows) ? updatedRows[0] : null;
    const updatedEtag = buildSettingsEtag(updatedRow);
    if (updatedEtag) {
      res.set('ETag', updatedEtag);
    }
    res.json({
      status: 'ok',
      settings: {
        locale: updatedRow?.locale ?? nextLocale ?? null,
        preferences: parsePreferences(updatedRow?.preferences) ?? nextPreferences ?? null,
        updatedAt: updatedRow?.updatedAt ?? null,
      },
      etag: updatedEtag,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/admin/health', requireAuth, requireAdmin, (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/bazi/calculate', (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  try {
    const payload = validation.payload;
    const result = getBaziCalculation(payload);
    const timeMeta = buildBirthTimeMeta(payload);
    // basic returns pillars + fiveElements
    res.json({
      pillars: result.pillars,
      fiveElements: result.fiveElements,
      fiveElementsPercent: result.fiveElementsPercent,
      ...timeMeta,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Calculation error' });
  }
});

app.post('/api/bazi/full-analysis', requireAuth, (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  try {
    const payload = validation.payload;
    const result = getBaziCalculation(payload);
    const timeMeta = buildBirthTimeMeta(payload);
    res.json({ ...result, ...timeMeta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Calculation error' });
  }
});

app.post('/api/ziwei/calculate', (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = req.body || {};
  if (!birthYear || !birthMonth || !birthDay || birthHour === undefined || !gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const birthYearNumber = Number(birthYear);
  const birthMonthNumber = Number(birthMonth);
  const birthDayNumber = Number(birthDay);
  const birthHourNumber = Number(birthHour);

  if (
    !Number.isInteger(birthYearNumber)
    || birthYearNumber < 1
    || birthYearNumber > 9999
    || !Number.isInteger(birthMonthNumber)
    || birthMonthNumber < 1
    || birthMonthNumber > 12
    || !Number.isInteger(birthDayNumber)
    || birthDayNumber < 1
    || birthDayNumber > 31
    || !Number.isInteger(birthHourNumber)
    || birthHourNumber < 0
    || birthHourNumber > 23
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const payload = {
      ...req.body,
      birthYear: birthYearNumber,
      birthMonth: birthMonthNumber,
      birthDay: birthDayNumber,
      birthHour: birthHourNumber,
    };
    const result = calculateZiweiChart(payload);
    const timeMeta = buildBirthTimeMeta(payload);
    res.json({ ...result, ...timeMeta });
  } catch (error) {
    console.error('Ziwei calculation error:', error);
    res.status(500).json({ error: 'Calculation error' });
  }
});

app.post('/api/bazi/records', requireAuth, async (req, res) => {
  const validation = validateBaziInput(req.body);
  if (!validation.ok) {
    const message = validation.reason === 'whitespace'
      ? 'Whitespace-only input is not allowed'
      : 'Missing required fields';
    return res.status(400).json({ error: message });
  }

  const submitKey = buildBaziSubmitKey(req.user.id, validation.payload);
  const inFlight = submitKey ? baziSubmitInFlight.get(submitKey) : null;
  if (inFlight) {
    try {
      const record = await inFlight;
      if (!record) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      return res.json({ record: serializeRecordWithTimezone(record) });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  const createRecord = async () => {
    const {
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
      birthLocation,
      timezone,
      result: providedResult,
    } = validation.payload;

    const calculationPayload = {
      ...validation.payload,
      birthYear,
      birthMonth,
      birthDay,
      birthHour,
      gender,
    };
    const normalizedProvidedResult =
      providedResult && typeof providedResult === 'object' ? providedResult : null;
    const needsCalculation =
      !normalizedProvidedResult?.pillars
      || !normalizedProvidedResult?.fiveElements
      || !normalizedProvidedResult?.tenGods
      || !normalizedProvidedResult?.luckCycles;
    const computedResult = needsCalculation ? getBaziCalculation(calculationPayload) : null;
    const finalResult = {
      pillars: normalizedProvidedResult?.pillars ?? computedResult?.pillars,
      fiveElements: normalizedProvidedResult?.fiveElements ?? computedResult?.fiveElements,
      tenGods: normalizedProvidedResult?.tenGods ?? computedResult?.tenGods ?? null,
      luckCycles: normalizedProvidedResult?.luckCycles ?? computedResult?.luckCycles ?? null,
    };

    if (!finalResult.pillars || !finalResult.fiveElements) {
      return null;
    }

    primeBaziCalculationCache(calculationPayload, finalResult);

    return prisma.baziRecord.create({
      data: {
        userId: req.user.id,
        birthYear,
        birthMonth,
        birthDay,
        birthHour,
        gender,
        birthLocation: typeof birthLocation === 'string' && birthLocation.trim()
          ? birthLocation.trim()
          : null,
        timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : null,
        pillars: JSON.stringify(finalResult.pillars),
        fiveElements: JSON.stringify(finalResult.fiveElements),
        tenGods: finalResult.tenGods ? JSON.stringify(finalResult.tenGods) : null,
        luckCycles: finalResult.luckCycles ? JSON.stringify(finalResult.luckCycles) : null,
      },
    });
  };

  const createPromise = createRecord();
  if (submitKey) {
    baziSubmitInFlight.set(submitKey, createPromise);
  }

  try {
    const record = await createPromise;
    if (!record) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    return res.json({ record: serializeRecordWithTimezone(record) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (submitKey) {
      baziSubmitInFlight.delete(submitKey);
    }
  }
});

const normalizeRangeFilter = (rangeDays) => {
  if (typeof rangeDays === 'string') {
    const normalized = rangeDays.trim().toLowerCase();
    if (normalized === 'today') return { rangeType: 'today', rangeDays: null };
    if (normalized === 'week' || normalized === 'this-week' || normalized === 'thisweek') {
      return { rangeType: 'week', rangeDays: null };
    }
  }
  const parsedRange = Number(rangeDays);
  const validRangeDays = Number.isFinite(parsedRange) && parsedRange > 0 ? parsedRange : null;
  return { rangeType: null, rangeDays: validRangeDays };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getStartOfLocalDayUtc = (baseDate, offsetMinutes) => {
  const offsetMs = offsetMinutes * 60000;
  const localNow = new Date(baseDate.getTime() + offsetMs);
  const localStartUtcMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  return new Date(localStartUtcMs - offsetMs);
};

const getStartOfLocalWeekUtc = (baseDate, offsetMinutes) => {
  const offsetMs = offsetMinutes * 60000;
  const localNow = new Date(baseDate.getTime() + offsetMs);
  const localStartUtcMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const day = localNow.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const weekStartLocalUtcMs = localStartUtcMs - diffToMonday * MS_PER_DAY;
  return new Date(weekStartLocalUtcMs - offsetMs);
};

const parseRecordsQuery = (source) => {
  const {
    page = '1',
    pageSize = '100',
    q,
    gender,
    rangeDays,
    sort,
    status,
    timezoneOffsetMinutes,
  } = source || {};

  const parsedPage = Number(page);
  const parsedPageSize = Number(pageSize);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.trunc(parsedPage) : 1;
  const safePageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0
    ? Math.min(Math.trunc(parsedPageSize), 500)
    : 100;

  const normalizedQuery = typeof q === 'string' ? q.trim() : '';
  const normalizedGender = typeof gender === 'string' ? gender.trim().toLowerCase() : '';
  const validGender = normalizedGender === 'male' || normalizedGender === 'female'
    ? normalizedGender
    : null;
  const { rangeType, rangeDays: validRangeDays } = normalizeRangeFilter(rangeDays);
  const resolvedTimezoneOffsetMinutes = parseTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const sortOption = typeof sort === 'string' && sort.trim() ? sort.trim() : 'created-desc';
  const statusOption = typeof status === 'string' ? status.trim().toLowerCase() : 'active';
  const normalizedStatus = ['active', 'deleted', 'all'].includes(statusOption) ? statusOption : 'active';

  return {
    safePage,
    safePageSize,
    normalizedQuery,
    validGender,
    validRangeDays,
    rangeType,
    timezoneOffsetMinutes: resolvedTimezoneOffsetMinutes,
    sortOption,
    normalizedStatus,
  };
};

const parseSearchTerms = (input) => {
  if (!input) return [];
  const terms = [];
  const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match = null;
  while ((match = regex.exec(input)) !== null) {
    const rawTerm = (match[1] || match[2] || match[3] || '').trim();
    const cleaned = rawTerm.replace(/^["']+|["']+$/g, '').trim();
    if (cleaned) terms.push(cleaned);
  }
  return terms;
};

const buildSearchOr = (term) => ([
  { birthLocation: { contains: term, mode: 'insensitive' } },
  { timezone: { contains: term, mode: 'insensitive' } },
  { gender: { contains: term, mode: 'insensitive' } },
  { pillars: { contains: term, mode: 'insensitive' } },
]);

const getBaziRecords = async (req, res, source) => {
  const {
    safePage,
    safePageSize,
    normalizedQuery,
    validGender,
    validRangeDays,
    rangeType,
    timezoneOffsetMinutes,
    sortOption,
    normalizedStatus,
  } = parseRecordsQuery(source);
  const hasQuotes = normalizedQuery.includes('"') || normalizedQuery.includes("'");
  const searchTerms = normalizedQuery
    ? (hasQuotes ? parseSearchTerms(normalizedQuery) : [normalizedQuery])
    : [];
  const normalizedTerms = searchTerms
    .map((term) => term.toLowerCase())
    .filter(Boolean);
  const shouldFilterInMemory = normalizedTerms.length > 0;
  const birthSortDirection = sortOption === 'birth-asc'
    ? 'asc'
    : sortOption === 'birth-desc'
      ? 'desc'
      : null;

  const baseWhere = { userId: req.user.id };
  const where = { userId: req.user.id };
  const deletedIds = await fetchDeletedRecordIds(req.user.id);

  if (normalizedStatus === 'active' && deletedIds.length) {
    baseWhere.id = { notIn: deletedIds };
    where.id = { notIn: deletedIds };
  } else if (normalizedStatus === 'deleted') {
    if (!deletedIds.length) {
      return res.json({
        records: [],
        hasMore: false,
        totalCount: 0,
        filteredCount: 0,
      });
    }
    baseWhere.id = { in: deletedIds };
    where.id = { in: deletedIds };
  }
  if (validGender) where.gender = validGender;
  if (rangeType === 'today') {
    const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
    const start = getStartOfLocalDayUtc(new Date(), offsetMinutes);
    where.createdAt = { gte: start };
  } else if (rangeType === 'week') {
    const offsetMinutes = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
    const start = getStartOfLocalWeekUtc(new Date(), offsetMinutes);
    where.createdAt = { gte: start };
  } else if (validRangeDays) {
    where.createdAt = { gte: new Date(Date.now() - validRangeDays * 24 * 60 * 60 * 1000) };
  }
  if (!shouldFilterInMemory && normalizedQuery) {
    if (searchTerms.length > 1) {
      where.AND = searchTerms.map((term) => ({ OR: buildSearchOr(term) }));
    } else if (searchTerms.length === 1) {
      where.OR = buildSearchOr(searchTerms[0]);
    }
  }

  let orderBy = { createdAt: 'desc' };
  if (sortOption === 'created-asc') {
    orderBy = { createdAt: 'asc' };
  } else if (sortOption === 'birth-desc') {
    orderBy = [
      { birthYear: 'desc' },
      { birthMonth: 'desc' },
      { birthDay: 'desc' },
      { birthHour: 'desc' },
      { createdAt: 'desc' },
    ];
  } else if (sortOption === 'birth-asc') {
    orderBy = [
      { birthYear: 'asc' },
      { birthMonth: 'asc' },
      { birthDay: 'asc' },
      { birthHour: 'asc' },
      { createdAt: 'desc' },
    ];
  }

  const skip = (safePage - 1) * safePageSize;

  if (shouldFilterInMemory) {
    const [totalCount, records] = await Promise.all([
      prisma.baziRecord.count({ where: baseWhere }),
      prisma.baziRecord.findMany({ where, orderBy }),
    ]);
    const filteredRecords = records.filter((record) =>
      normalizedTerms.every((term) => recordMatchesQuery(record, term))
    );
    const sortedRecords = birthSortDirection
      ? sortRecordsByBirth(filteredRecords, birthSortDirection)
      : filteredRecords;
    const filteredCount = sortedRecords.length;
    const pageSlice = sortedRecords.slice(skip, skip + safePageSize + 1);
    const hasMore = pageSlice.length > safePageSize;
    const pageRecords = hasMore ? pageSlice.slice(0, safePageSize) : pageSlice;

    return res.json({
      records: pageRecords.map(serializeRecordWithTimezone),
      hasMore,
      totalCount,
      filteredCount,
    });
  }

  if (birthSortDirection) {
    const [totalCount, records] = await Promise.all([
      prisma.baziRecord.count({ where: baseWhere }),
      prisma.baziRecord.findMany({ where }),
    ]);
    const sortedRecords = sortRecordsByBirth(records, birthSortDirection);
    const filteredCount = sortedRecords.length;
    const pageSlice = sortedRecords.slice(skip, skip + safePageSize + 1);
    const hasMore = pageSlice.length > safePageSize;
    const pageRecords = hasMore ? pageSlice.slice(0, safePageSize) : pageSlice;

    return res.json({
      records: pageRecords.map(serializeRecordWithTimezone),
      hasMore,
      totalCount,
      filteredCount,
    });
  }

  const [totalCount, filteredCount, records] = await Promise.all([
    prisma.baziRecord.count({ where: baseWhere }),
    prisma.baziRecord.count({ where }),
    prisma.baziRecord.findMany({
      where,
      orderBy,
      skip,
      take: safePageSize + 1,
    }),
  ]);
  const hasMore = records.length > safePageSize;
  const pageRecords = hasMore ? records.slice(0, safePageSize) : records;

  return res.json({
    records: pageRecords.map(serializeRecordWithTimezone),
    hasMore,
    totalCount,
    filteredCount,
  });
};

app.get('/api/bazi/records', requireAuth, async (req, res) => {
  return getBaziRecords(req, res, req.query);
});

app.post('/api/bazi/records/search', requireAuth, async (req, res) => {
  return getBaziRecords(req, res, req.body);
});

app.get('/api/bazi/records/export', requireAuth, async (req, res) => {
  const {
    normalizedQuery,
    validGender,
    validRangeDays,
    sortOption,
    normalizedStatus,
  } = parseRecordsQuery(req.query);
  const hasQuotes = normalizedQuery.includes('"') || normalizedQuery.includes("'");
  const searchTerms = normalizedQuery
    ? (hasQuotes ? parseSearchTerms(normalizedQuery) : [normalizedQuery])
    : [];
  const normalizedTerms = searchTerms
    .map((term) => term.toLowerCase())
    .filter(Boolean);
  const shouldFilterInMemory = normalizedTerms.length > 0;

  const where = { userId: req.user.id };
  const deletedIds = await fetchDeletedRecordIds(req.user.id);

  if (normalizedStatus === 'active' && deletedIds.length) {
    where.id = { notIn: deletedIds };
  } else if (normalizedStatus === 'deleted') {
    if (!deletedIds.length) {
      return res.json({
        version: 1,
        exportedAt: new Date().toISOString(),
        records: [],
      });
    }
    where.id = { in: deletedIds };
  }
  if (validGender) where.gender = validGender;
  if (validRangeDays) {
    where.createdAt = { gte: new Date(Date.now() - validRangeDays * 24 * 60 * 60 * 1000) };
  }
  if (!shouldFilterInMemory && normalizedQuery) {
    if (searchTerms.length > 1) {
      where.AND = searchTerms.map((term) => ({ OR: buildSearchOr(term) }));
    } else if (searchTerms.length === 1) {
      where.OR = buildSearchOr(searchTerms[0]);
    }
  }

  let orderBy = { createdAt: 'desc' };
  if (sortOption === 'created-asc') {
    orderBy = { createdAt: 'asc' };
  } else if (sortOption === 'birth-desc') {
    orderBy = [
      { birthYear: 'desc' },
      { birthMonth: 'desc' },
      { birthDay: 'desc' },
      { birthHour: 'desc' },
      { createdAt: 'desc' },
    ];
  } else if (sortOption === 'birth-asc') {
    orderBy = [
      { birthYear: 'asc' },
      { birthMonth: 'asc' },
      { birthDay: 'asc' },
      { birthHour: 'asc' },
      { createdAt: 'desc' },
    ];
  }

  let records = await prisma.baziRecord.findMany({
    where,
    orderBy,
  });
  if (shouldFilterInMemory) {
    records = records.filter((record) =>
      normalizedTerms.every((term) => recordMatchesQuery(record, term))
    );
  }
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    records: records.map(serializeRecordWithTimezone),
  });
});

app.post('/api/bazi/records/import', requireAuth, async (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : req.body?.records;
  if (!Array.isArray(incoming) || !incoming.length) {
    return res.status(400).json({ error: 'No records provided' });
  }

  const toCreate = [];
  const errorIndices = [];
  const importEntries = [];
  incoming.forEach((raw, index) => {
    const record = buildImportRecord(raw, req.user.id);
    if (record) {
      importEntries.push({ index, record });
      toCreate.push(record);
    } else {
      errorIndices.push(index);
    }
  });

  if (!toCreate.length) {
    return res.status(400).json({ error: 'No valid records found' });
  }

  try {
    const result = await prisma.baziRecord.createMany({ data: toCreate });
    res.json({
      created: result.count,
      skipped: incoming.length - toCreate.length,
      errors: errorIndices.length ? errorIndices.slice(0, 5) : undefined,
    });
  } catch (error) {
    console.error('Import error (bulk):', error);
    let created = 0;
    const failedIndices = [];
    for (const entry of importEntries) {
      try {
        await prisma.baziRecord.create({ data: entry.record });
        created += 1;
      } catch (entryError) {
        console.error('Import error (single):', entryError);
        failedIndices.push(entry.index);
      }
    }

    if (!created) {
      return res.status(500).json({
        error: 'Unable to import records',
        failed: failedIndices.slice(0, 5),
      });
    }

    res.json({
      created,
      skipped: incoming.length - toCreate.length,
      failed: failedIndices.length ? failedIndices.slice(0, 5) : undefined,
      errors: errorIndices.length ? errorIndices.slice(0, 5) : undefined,
    });
  }
});

app.post('/api/bazi/records/bulk-delete', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids || !ids.length) {
    return res.status(400).json({ error: 'No record ids provided' });
  }

  const normalizedIds = ids
    .map((id) => parseIdParam(id))
    .filter((id) => id !== null);

  if (!normalizedIds.length) {
    return res.status(400).json({ error: 'No valid record ids provided' });
  }

  const existing = await prisma.baziRecord.findMany({
    where: { userId: req.user.id, id: { in: normalizedIds } },
    select: { id: true },
  });
  const existingIds = existing.map((record) => record.id);

  if (!existingIds.length) {
    return res.status(404).json({ error: 'No matching records found' });
  }

  await ensureSoftDeleteReady();
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT OR IGNORE INTO BaziRecordTrash (userId, recordId)
      VALUES ${Prisma.join(existingIds.map((id) => Prisma.sql`(${req.user.id}, ${id})`))}
    `
  );

  res.json({
    deleted: existingIds.length,
    requested: normalizedIds.length,
    skipped: normalizedIds.length - existingIds.length,
  });
});

app.get('/api/bazi/records/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });
  if (await isRecordSoftDeleted(req.user.id, recordId)) {
    return res.status(404).json({ error: 'Record not found' });
  }
  res.json({ record: serializeRecordWithTimezone(record) });
});

app.delete('/api/bazi/records/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  invalidateBaziCalculationCache({
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
    birthDay: record.birthDay,
    birthHour: record.birthHour,
    gender: record.gender,
  });

  await ensureSoftDeleteReady();
  await prisma.$executeRaw`
    INSERT OR IGNORE INTO BaziRecordTrash (userId, recordId) VALUES (${req.user.id}, ${recordId})
  `;
  res.json({ status: 'ok', softDeleted: true });
});

app.post('/api/bazi/records/:id/restore', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  await ensureSoftDeleteReady();
  const deletedRows = await prisma.$queryRaw`
    SELECT id FROM BaziRecordTrash WHERE userId = ${req.user.id} AND recordId = ${recordId} LIMIT 1
  `;
  if (!deletedRows.length) {
    return res.status(404).json({ error: 'Record not deleted' });
  }

  await prisma.$executeRaw`
    DELETE FROM BaziRecordTrash WHERE userId = ${req.user.id} AND recordId = ${recordId}
  `;

  res.json({ status: 'ok', record: serializeRecordWithTimezone(record) });
});

app.post('/api/favorites', requireAuth, async (req, res) => {
  const { recordId } = req.body;
  if (!recordId) return res.status(400).json({ error: 'Record ID required' });

  const record = await prisma.baziRecord.findFirst({ where: { id: recordId, userId: req.user.id } });
  if (!record) return res.status(404).json({ error: 'Record not found' });
  if (await isRecordSoftDeleted(req.user.id, recordId)) {
    return res.status(404).json({ error: 'Record not found' });
  }

  const existingFavorite = await prisma.favorite.findUnique({
    where: { userId_recordId: { userId: req.user.id, recordId } },
  });
  if (existingFavorite) {
    return res.status(409).json({ error: 'Favorite already exists' });
  }

  let favorite = null;
  try {
    favorite = await prisma.favorite.create({
      data: { userId: req.user.id, recordId },
      include: { record: true },
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Favorite already exists' });
    }
    console.error('Failed to create favorite:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  res.json({
    favorite: {
      ...favorite,
      record: serializeRecordWithTimezone(favorite.record),
    },
  });
});

app.get('/api/favorites', requireAuth, async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user.id, record: { userId: req.user.id } },
    include: { record: true },
    orderBy: { createdAt: 'desc' },
  });
  const deletedIds = await fetchDeletedRecordIds(req.user.id);
  const deletedSet = new Set(deletedIds);
  res.json({
    favorites: favorites
      .filter((favorite) => !deletedSet.has(favorite.recordId))
      .map((favorite) => ({
        ...favorite,
        record: serializeRecordWithTimezone(favorite.record),
      })),
  });
});

app.delete('/api/favorites/:id', requireAuth, async (req, res) => {
  const favoriteId = parseIdParam(req.params.id);
  if (!favoriteId) return res.status(400).json({ error: 'Invalid favorite id' });
  const favorite = await prisma.favorite.findFirst({ where: { id: favoriteId, userId: req.user.id } });
  if (!favorite) return res.status(404).json({ error: 'Favorite not found' });

  await prisma.favorite.delete({ where: { id: favoriteId } });
  res.json({ status: 'ok' });
});


app.post('/api/bazi/ai-interpret', requireAuth, async (req, res) => {
  const { pillars, fiveElements, tenGods, strength } = req.body;
  if (!pillars) return res.status(400).json({ error: 'Bazi data required' });

  const { system, user, fallback } = buildBaziPrompt({
    pillars,
    fiveElements,
    tenGods,
    luckCycles: req.body.luckCycles,
    strength
  });

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback });
    res.json({ content });
  } finally {
    release();
  }
});


// --- Tarot Endpoints ---

const TAROT_SPREADS = {
  SingleCard: {
    count: 1,
    positions: [
      { label: 'Insight', meaning: 'The core message to focus on right now.' }
    ]
  },
  ThreeCard: {
    count: 3,
    positions: [
      { label: 'Past', meaning: 'What led to this moment.' },
      { label: 'Present', meaning: 'The current energy or situation.' },
      { label: 'Future', meaning: 'Likely direction if the path continues.' }
    ]
  },
  CelticCross: {
    count: 10,
    positions: [
      { label: 'Present', meaning: 'Your current situation or heart of the matter.' },
      { label: 'Challenge', meaning: 'The obstacle, tension, or crossing influence.' },
      { label: 'Past', meaning: 'Recent past events or influences fading.' },
      { label: 'Future', meaning: 'Near-future direction or next steps.' },
      { label: 'Above', meaning: 'Conscious goals, aspirations, or ideals.' },
      { label: 'Below', meaning: 'Subconscious roots, foundations, or hidden motives.' },
      { label: 'Advice', meaning: 'Guidance on how to respond or proceed.' },
      { label: 'External', meaning: 'Outside influences, people, or environment.' },
      { label: 'Hopes/Fears', meaning: 'Inner desires, anxieties, or expectations.' },
      { label: 'Outcome', meaning: 'Likely outcome if current course continues.' }
    ]
  }
};

const getTarotSpreadConfig = (spreadType) => {
  if (!spreadType) return TAROT_SPREADS.SingleCard;
  return TAROT_SPREADS[spreadType] || TAROT_SPREADS.SingleCard;
};

app.post('/api/tarot/draw', requireAuth, async (req, res) => {
  const { spreadType = 'SingleCard' } = req.body;
  const normalizedSpread = spreadType || 'SingleCard';
  const spreadConfig = getTarotSpreadConfig(normalizedSpread);
  const positions = spreadConfig.positions || [];

  // Simple shuffle
  const shuffled = [...tarotDeck].sort(() => 0.5 - Math.random());

  const drawCount = spreadConfig.count || 1;
  const drawnCards = shuffled.slice(0, drawCount).map((card, index) => ({
    ...card,
    position: index + 1,
    positionLabel: positions[index]?.label || spreadConfig.labels?.[index] || null,
    positionMeaning: positions[index]?.meaning || null,
    isReversed: Math.random() < 0.3 // 30% chance of reversal
  }));

  res.json({
    spreadType: normalizedSpread,
    cards: drawnCards,
    spreadMeta: {
      positions: positions.map((position, index) => ({
        position: index + 1,
        label: position.label,
        meaning: position.meaning
      }))
    }
  });
});

app.post('/api/tarot/ai-interpret', requireAuth, async (req, res) => {
  const { spreadType, cards, userQuestion } = req.body;
  if (!cards || cards.length === 0) return res.status(400).json({ error: 'No cards provided' });

  const normalizedSpread = spreadType || 'SingleCard';
  const spreadConfig = getTarotSpreadConfig(normalizedSpread);
  const positions = spreadConfig.positions || [];
  const cardList = cards.map((card, index) => {
    const positionLabel = card.positionLabel || positions[index]?.label;
    const positionMeaning = card.positionMeaning || positions[index]?.meaning;
    const positionText = [
      positionLabel ? `${positionLabel}` : null,
      positionMeaning ? `${positionMeaning}` : null
    ].filter(Boolean).join(' — ');
    return `${card.position}. ${positionText ? `${positionText} - ` : ''}${card.name} (${card.isReversed ? 'Reversed' : 'Upright'}) - ${card.isReversed ? card.meaningRev : card.meaningUp}`;
  }).join('\n');

  const system = 'You are a tarot reader. Provide a concise reading in Markdown with sections: Interpretation and Advice. Use the position meanings for context. Keep under 220 words. Reference key cards by name.';
  const user = `
Spread: ${normalizedSpread || 'Unknown'}
Question: ${userQuestion || 'General Reading'}
Cards:
${cardList}
  `.trim();
  const fallback = () => `
## 🔮 Tarot Reading: ${normalizedSpread || 'Unknown'}
**Interpretation:** The spread points to momentum building around your question, with key lessons emerging from the central cards.

**Advice:** Reflect on the card themes and take one grounded action aligned with the most constructive card.
  `.trim();

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  let content = '';
  try {
    content = await generateAIContent({ system, user, fallback });
  } finally {
    release();
  }

  // Persist the record
  try {
    await prisma.tarotRecord.create({
      data: {
        userId: req.user.id,
        spreadType: normalizedSpread,
        cards: JSON.stringify(cards),
        userQuestion,
        aiInterpretation: content
      }
    });
  } catch (e) {
    console.error('Failed to save tarot record:', e);
    // Don't block response on save failure, but good to know
  }

  res.json({ content });
});

app.get('/api/tarot/history', requireAuth, async (req, res) => {
  try {
    const records = await prisma.tarotRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    const payload = records.map((record) => ({
      id: record.id,
      spreadType: record.spreadType,
      userQuestion: record.userQuestion,
      aiInterpretation: record.aiInterpretation,
      cards: JSON.parse(record.cards || '[]'),
      createdAt: record.createdAt
    }));
    res.json({ records: payload });
  } catch (error) {
    console.error('Failed to load tarot history:', error);
    res.status(500).json({ error: 'Unable to load history' });
  }
});

app.delete('/api/tarot/history/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });

  try {
    const record = await prisma.tarotRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.tarotRecord.delete({ where: { id: recordId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete tarot record:', error);
    res.status(500).json({ error: 'Unable to delete record' });
  }
});

// --- I Ching Endpoints ---

app.get('/api/iching/hexagrams', (req, res) => {
  res.json({ hexagrams });
});

app.post('/api/iching/divine', (req, res) => {
  const { method = 'number', numbers } = req.body || {};
  let inputNumbers = numbers;
  let timeContext = null;

  if (method === 'time') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    inputNumbers = [year + month + day, hour + minute, year + month + day + hour + minute];
    timeContext = { year, month, day, hour, minute, iso: now.toISOString() };
  } else if (!Array.isArray(numbers) || numbers.length !== 3) {
    return res.status(400).json({ error: 'Provide three numbers for number divination.' });
  }

  const parsedNumbers = inputNumbers.map((value) => Number(value));
  if (parsedNumbers.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'Numbers must be valid integers.' });
  }

  const upperTrigram = pickTrigram(parsedNumbers[0]);
  const lowerTrigram = pickTrigram(parsedNumbers[1]);
  let changingLines = [];
  if (method === 'time' && timeContext) {
    const baseSum = timeContext.year + timeContext.month + timeContext.day;
    const timeSum = timeContext.hour + timeContext.minute;
    const totalSum = baseSum + timeSum;
    const candidates = [
      normalizeNumber(baseSum, 6),
      normalizeNumber(timeSum, 6),
      normalizeNumber(totalSum, 6),
    ].filter(Boolean);
    changingLines = [...new Set(candidates)].sort((a, b) => a - b);
  } else {
    const changingLine = normalizeNumber(parsedNumbers[0] + parsedNumbers[1] + parsedNumbers[2], 6);
    if (changingLine) changingLines = [changingLine];
  }
  if (!upperTrigram || !lowerTrigram) {
    return res.status(400).json({ error: 'Unable to compute a hexagram from the provided numbers.' });
  }

  const hexagram = buildHexagram(upperTrigram, lowerTrigram);
  if (!hexagram) {
    return res.status(500).json({ error: 'Hexagram lookup failed.' });
  }

  const resultingHexagram = applyChangingLines(hexagram, changingLines);

  res.json({
    method,
    numbers: parsedNumbers,
    timeContext,
    hexagram,
    changingLines,
    resultingHexagram,
  });
});

app.post('/api/iching/ai-interpret', requireAuth, async (req, res) => {
  const { hexagram, resultingHexagram, changingLines, userQuestion, method, timeContext } = req.body;
  if (!hexagram) return res.status(400).json({ error: 'Hexagram data required' });

  const lines = Array.isArray(changingLines) && changingLines.length > 0 ? changingLines.join(', ') : 'None';
  const hexagramName = typeof hexagram === 'string' ? hexagram : (hexagram?.name || 'Unknown');
  const resultName = resultingHexagram
    ? (typeof resultingHexagram === 'string' ? resultingHexagram : (resultingHexagram?.name || 'Unknown'))
    : 'None';
  const timeLine = timeContext
    ? `Time: ${timeContext.year}-${String(timeContext.month).padStart(2, '0')}-${String(timeContext.day).padStart(2, '0')} ${String(timeContext.hour).padStart(2, '0')}:${String(timeContext.minute).padStart(2, '0')}`
    : null;
  const methodLine = method ? `Method: ${method}` : null;

  const system = 'You are an I Ching interpreter. Provide a concise interpretation in Markdown with sections: Interpretation and Advice. Mention the primary and resulting hexagrams when available. Keep under 200 words.';
  const user = `
Question: ${userQuestion || 'General Guidance'}
${methodLine || ''}
${timeLine || ''}
Hexagram: ${hexagramName}
Resulting Hexagram: ${resultName}
Changing Lines: ${lines}
  `.trim();
  const fallback = () => `
## ☯️ I Ching Interpretation
**Interpretation:** The primary hexagram points to steady progress through mindful adaptation, while the resulting hexagram signals how the situation may evolve.

**Advice:** Align with your core values while remaining flexible about timing and approach.
  `.trim();

  const release = acquireAiGuard(req.user.id);
  if (!release) {
    return res.status(429).json({ error: AI_CONCURRENCY_ERROR });
  }
  try {
    const content = await generateAIContent({ system, user, fallback });
    res.json({ content });
  } finally {
    release();
  }
});

app.post('/api/iching/history', requireAuth, async (req, res) => {
  const {
    method,
    numbers,
    hexagram,
    resultingHexagram,
    changingLines,
    timeContext,
    userQuestion,
    aiInterpretation,
  } = req.body || {};

  if (!hexagram || typeof hexagram !== 'object') {
    return res.status(400).json({ error: 'Hexagram data required' });
  }

  try {
    const record = await prisma.ichingRecord.create({
      data: {
        userId: req.user.id,
        method: typeof method === 'string' && method.trim() ? method.trim() : 'number',
        numbers: Array.isArray(numbers) ? JSON.stringify(numbers) : null,
        hexagram: JSON.stringify(hexagram),
        resultingHexagram: resultingHexagram ? JSON.stringify(resultingHexagram) : null,
        changingLines: Array.isArray(changingLines) ? JSON.stringify(changingLines) : null,
        timeContext: timeContext ? JSON.stringify(timeContext) : null,
        userQuestion: typeof userQuestion === 'string' ? userQuestion.trim() : null,
        aiInterpretation: typeof aiInterpretation === 'string' ? aiInterpretation : null,
      },
    });
    res.json({ record: serializeIchingRecord(record) });
  } catch (error) {
    console.error('Failed to save I Ching record:', error);
    res.status(500).json({ error: 'Unable to save record' });
  }
});

app.get('/api/iching/history', requireAuth, async (req, res) => {
  try {
    const records = await prisma.ichingRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ records: records.map(serializeIchingRecord) });
  } catch (error) {
    console.error('Failed to load I Ching history:', error);
    res.status(500).json({ error: 'Unable to load history' });
  }
});

app.delete('/api/iching/history/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });

  try {
    const record = await prisma.ichingRecord.findUnique({ where: { id: recordId } });
    if (!record || record.userId !== req.user.id) {
      return res.status(404).json({ error: 'Record not found' });
    }
    await prisma.ichingRecord.delete({ where: { id: recordId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete I Ching record:', error);
    res.status(500).json({ error: 'Unable to delete record' });
  }
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').length > MAX_URL_LENGTH) {
    socket.write('HTTP/1.1 414 Request-URI Too Long\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (req.url !== WS_PATH) {
    socket.destroy();
    return;
  }

  const upgradeHeader = req.headers.upgrade;
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = buildWsAcceptKey(key);
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
  ];
  socket.write(`${responseHeaders.join('\r\n')}\r\n\r\n`);

  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let isBusy = false;
  let isClosed = false;

  const sendClose = (code = 1000) => {
    if (isClosed) return;
    isClosed = true;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    socket.write(encodeWsFrame(payload, 0x8));
    socket.end();
  };

  const sendPong = (payload) => {
    if (isClosed) return;
    socket.write(encodeWsFrame(payload, 0x0a));
  };

  const streamContent = async (content) => {
    const chunkSize = 120;
    for (let i = 0; i < content.length; i += chunkSize) {
      if (isClosed) return;
      const chunk = content.slice(i, i + chunkSize);
      sendWsJson(socket, { type: 'chunk', content: chunk });
    }
  };

  const handleTextMessage = async (text) => {
    if (isClosed) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      sendWsJson(socket, { type: 'error', message: 'Invalid JSON payload.' });
      sendClose(1002);
      return;
    }

    if (message?.type !== 'bazi_ai_request') {
      sendWsJson(socket, { type: 'error', message: 'Unsupported request type.' });
      return;
    }

    if (isBusy) {
      sendWsJson(socket, { type: 'error', message: 'Request already in progress.' });
      return;
    }
    isBusy = true;

    let release = null;
    try {
      const token = message?.token;
      const user = await authorizeToken(token);
      release = acquireAiGuard(user.id);
      if (!release) {
        sendWsJson(socket, { type: 'error', message: AI_CONCURRENCY_ERROR });
        return;
      }
      const payload = message?.payload;
      if (!payload?.pillars) {
        sendWsJson(socket, { type: 'error', message: 'Bazi data required.' });
        sendClose(1003);
        return;
      }

      sendWsJson(socket, { type: 'start' });
      const { system, user: userPrompt, fallback } = buildBaziPrompt(payload);
      const content = await generateAIContent({ system, user: userPrompt, fallback });
      await streamContent(content || '');
      sendWsJson(socket, { type: 'done' });
      sendClose(1000);
    } catch (error) {
      sendWsJson(socket, { type: 'error', message: error.message || 'AI request failed.' });
      sendClose(1011);
    } finally {
      if (release) {
        release();
      }
      isBusy = false;
    }
  };

  sendWsJson(socket, { type: 'connected' });

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    const result = decodeWsFrames(buffer);
    buffer = result.remainder;

    for (const frame of result.frames) {
      if (frame.payload.length > WS_MAX_PAYLOAD) {
        sendWsJson(socket, { type: 'error', message: 'Payload too large.' });
        sendClose(1009);
        return;
      }

      if (frame.opcode === 0x8) {
        sendClose(1000);
        return;
      }
      if (frame.opcode === 0x9) {
        sendPong(frame.payload);
        continue;
      }
      if (frame.opcode === 0x1) {
        const text = frame.payload.toString('utf8');
        void handleTextMessage(text);
      }
    }
  });

  socket.on('error', () => {
    sendClose(1011);
  });
});

server.listen(PORT, () => {

  console.log(`BaZi Master API running on http://localhost:${PORT}`);
});

void ensureUserSettingsTable();
void ensureDefaultUser();

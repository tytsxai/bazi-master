import express from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { Solar } from 'lunar-javascript';
import tarotDeck from './data/tarotData.js';
import { TRIGRAMS, hexagrams, hexagramByTrigrams, hexagramByLines } from './data/ichingHexagrams.js';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
console.log('--- SERVER STARTING: FIX APPLIED ---');

app.use(cors());
app.use(express.json());

// --- AI Provider Settings ---
const AI_PROVIDER = (process.env.AI_PROVIDER
  || (process.env.OPENAI_API_KEY ? 'openai' : null)
  || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : null)
  || 'mock').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 700);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);

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

// --- Mappings & Constants ---
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS || 30 * 60 * 1000);
const sessionStore = new Map();

const parseAuthToken = (token) => {
  const match = token.match(/^token_(\d+)_(\d+)$/);
  if (!match) return null;
  const userId = Number(match[1]);
  const issuedAt = Number(match[2]);
  if (!Number.isFinite(userId) || !Number.isFinite(issuedAt)) return null;
  return { userId, issuedAt };
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

const requireAuth = async (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = parseAuthToken(token);
  if (!parsed) return res.status(401).json({ error: 'Invalid token' });
  if (Date.now() - parsed.issuedAt > TOKEN_TTL_MS) {
    return res.status(401).json({ error: 'Token expired' });
  }

  const now = Date.now();
  const lastSeen = sessionStore.get(token) ?? parsed.issuedAt;
  if (now - lastSeen > SESSION_IDLE_MS) {
    sessionStore.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  sessionStore.set(token, now);

  const userId = parsed.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  req.user = { id: user.id, email: user.email, name: user.name };
  next();
};

const serializeRecord = (record) => ({
  ...record,
  pillars: JSON.parse(record.pillars),
  fiveElements: JSON.parse(record.fiveElements),
  tenGods: record.tenGods ? JSON.parse(record.tenGods) : null,
  luckCycles: record.luckCycles ? JSON.parse(record.luckCycles) : null,
});

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
    if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
    const token = `token_${user.id}_${Date.now()}`;
    sessionStore.set(token, Date.now());
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/user/settings', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT locale, preferences FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    res.json({
      settings: {
        locale: row?.locale ?? null,
        preferences: parsePreferences(row?.preferences),
      },
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
    const rows = await prisma.$queryRaw`
      SELECT locale, preferences FROM UserSettings WHERE userId = ${req.user.id} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    const existingPreferences = parsePreferences(row?.preferences);
    const nextLocale = typeof locale === 'string' ? locale : row?.locale ?? null;
    const nextPreferences = preferences ?? existingPreferences ?? null;
    const preferencesJson = nextPreferences ? JSON.stringify(nextPreferences) : null;

    await prisma.$executeRaw`
      INSERT INTO UserSettings (userId, locale, preferences, createdAt, updatedAt)
      VALUES (${req.user.id}, ${nextLocale}, ${preferencesJson}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(userId)
      DO UPDATE SET locale = excluded.locale, preferences = excluded.preferences, updatedAt = CURRENT_TIMESTAMP
    `;

    res.json({ status: 'ok', settings: { locale: nextLocale, preferences: nextPreferences } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/bazi/calculate', (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = req.body;
  if (!birthYear || !birthMonth || !birthDay || birthHour === undefined || !gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = performCalculation(req.body);
    // basic returns pillars + fiveElements
    res.json({
      pillars: result.pillars,
      fiveElements: result.fiveElements,
      fiveElementsPercent: result.fiveElementsPercent,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Calculation error' });
  }
});

app.post('/api/bazi/full-analysis', requireAuth, (req, res) => {
  const { birthYear, birthMonth, birthDay, birthHour, gender } = req.body;
  if (!birthYear || !birthMonth || !birthDay || birthHour === undefined || !gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = performCalculation(req.body);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Calculation error' });
  }
});

app.post('/api/bazi/records', requireAuth, async (req, res) => {
  const {
    birthYear,
    birthMonth,
    birthDay,
    birthHour,
    gender,
    birthLocation,
    timezone,
    result: providedResult,
  } = req.body || {};

  const birthYearNumber = Number(birthYear);
  const birthMonthNumber = Number(birthMonth);
  const birthDayNumber = Number(birthDay);
  const birthHourNumber = Number(birthHour);

  if (!gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
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
    const calculationPayload = {
      ...req.body,
      birthYear: birthYearNumber,
      birthMonth: birthMonthNumber,
      birthDay: birthDayNumber,
      birthHour: birthHourNumber,
    };
    const normalizedProvidedResult =
      providedResult && typeof providedResult === 'object' ? providedResult : null;
    const needsCalculation =
      !normalizedProvidedResult?.pillars
      || !normalizedProvidedResult?.fiveElements
      || !normalizedProvidedResult?.tenGods
      || !normalizedProvidedResult?.luckCycles;
    const computedResult = needsCalculation ? performCalculation(calculationPayload) : null;
    const finalResult = {
      pillars: normalizedProvidedResult?.pillars ?? computedResult?.pillars,
      fiveElements: normalizedProvidedResult?.fiveElements ?? computedResult?.fiveElements,
      tenGods: normalizedProvidedResult?.tenGods ?? computedResult?.tenGods ?? null,
      luckCycles: normalizedProvidedResult?.luckCycles ?? computedResult?.luckCycles ?? null,
    };

    if (!finalResult.pillars || !finalResult.fiveElements) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const record = await prisma.baziRecord.create({
      data: {
        userId: req.user.id,
        birthYear: birthYearNumber,
        birthMonth: birthMonthNumber,
        birthDay: birthDayNumber,
        birthHour: birthHourNumber,
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

    res.json({ record: serializeRecord(record) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bazi/records', requireAuth, async (req, res) => {
  const records = await prisma.baziRecord.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ records: records.map(serializeRecord) });
});

app.delete('/api/bazi/records/:id', requireAuth, async (req, res) => {
  const recordId = parseIdParam(req.params.id);
  if (!recordId) return res.status(400).json({ error: 'Invalid record id' });
  const record = await prisma.baziRecord.findFirst({
    where: { id: recordId, userId: req.user.id },
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { recordId } }),
    prisma.baziRecord.delete({ where: { id: recordId } }),
  ]);
  res.json({ status: 'ok' });
});

app.post('/api/favorites', requireAuth, async (req, res) => {
  const { recordId } = req.body;
  if (!recordId) return res.status(400).json({ error: 'Record ID required' });

  const record = await prisma.baziRecord.findFirst({ where: { id: recordId, userId: req.user.id } });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  const favorite = await prisma.favorite.upsert({
    where: { userId_recordId: { userId: req.user.id, recordId } },
    update: {},
    create: { userId: req.user.id, recordId },
    include: { record: true },
  });

  res.json({
    favorite: {
      ...favorite,
      record: serializeRecord(favorite.record),
    },
  });
});

app.get('/api/favorites', requireAuth, async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    include: { record: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    favorites: favorites.map((favorite) => ({
      ...favorite,
      record: serializeRecord(favorite.record),
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
  const luckLines = Array.isArray(req.body.luckCycles)
    ? req.body.luckCycles.map((cycle) => `- ${cycle.range}: ${cycle.stem}${cycle.branch}`).join('\n')
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

  const content = await generateAIContent({ system, user, fallback });
  res.json({ content });
});


// --- Tarot Endpoints ---

const TAROT_SPREADS = {
  SingleCard: { count: 1, labels: ['Insight'] },
  ThreeCard: { count: 3, labels: ['Past', 'Present', 'Future'] },
  CelticCross: {
    count: 10,
    labels: [
      'Present',
      'Challenge',
      'Past',
      'Future',
      'Above',
      'Below',
      'Advice',
      'External',
      'Hopes/Fears',
      'Outcome'
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

  // Simple shuffle
  const shuffled = [...tarotDeck].sort(() => 0.5 - Math.random());

  const drawCount = spreadConfig.count || 1;
  const drawnCards = shuffled.slice(0, drawCount).map((card, index) => ({
    ...card,
    position: index + 1,
    positionLabel: spreadConfig.labels?.[index] || null,
    isReversed: Math.random() < 0.3 // 30% chance of reversal
  }));

  res.json({ spreadType: normalizedSpread, cards: drawnCards });
});

app.post('/api/tarot/ai-interpret', requireAuth, async (req, res) => {
  const { spreadType, cards, userQuestion } = req.body;
  if (!cards || cards.length === 0) return res.status(400).json({ error: 'No cards provided' });

  const normalizedSpread = spreadType || 'SingleCard';
  const cardList = cards.map(c =>
    `${c.position}. ${c.positionLabel ? `${c.positionLabel} - ` : ''}${c.name} (${c.isReversed ? 'Reversed' : 'Upright'}) - ${c.isReversed ? c.meaningRev : c.meaningUp}`
  ).join('\n');

  const system = 'You are a tarot reader. Provide a concise reading in Markdown with sections: Interpretation and Advice. Keep under 220 words. Reference key cards by name.';
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

  const content = await generateAIContent({ system, user, fallback });

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

  const content = await generateAIContent({ system, user, fallback });
  res.json({ content });
});

app.listen(PORT, () => {

  console.log(`BaZi Master API running on http://localhost:${PORT}`);
});

void ensureUserSettingsTable();
void ensureDefaultUser();

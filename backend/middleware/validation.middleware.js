const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /javascript\s*:/gi,
];

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

const sanitizeString = (str, maxLength) => {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const pattern of XSS_PATTERNS) {
    result = result.replace(pattern, '');
  }
  result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
  if (Number.isFinite(maxLength) && maxLength > 0) {
    result = result.slice(0, maxLength);
  }
  return result;
};

const sanitizeValue = (value, depth, options, state) => {
  if (!state.ok) return value;
  if (depth > options.maxDepth) {
    state.ok = false;
    state.reason = 'max_depth';
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeString(value, options.maxStringLength);
  }
  if (Array.isArray(value)) {
    if (value.length > options.maxArrayLength) {
      state.ok = false;
      state.reason = 'array_too_long';
    }
    return value
      .slice(0, options.maxArrayLength)
      .map((item) => sanitizeValue(item, depth + 1, options, state));
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      state.ok = false;
      state.reason = 'blocked_key';
      return value;
    }
    if (!isPlainObject(value)) return value;
    const entries = Object.entries(value);
    if (entries.length > options.maxKeys) {
      state.ok = false;
      state.reason = 'too_many_keys';
    }
    const sanitized = {};
    for (const [key, val] of entries) {
      if (BLOCKED_KEYS.has(key)) {
        state.ok = false;
        state.reason = 'blocked_key';
        continue;
      }
      const safeKey = sanitizeString(key, options.maxStringLength);
      sanitized[safeKey] = sanitizeValue(val, depth + 1, options, state);
    }
    return sanitized;
  }
  return value;
};

const buildOptions = (env = process.env) => ({
  maxDepth: Number.parseInt(env.MAX_INPUT_DEPTH || '', 10) || 6,
  maxKeys: Number.parseInt(env.MAX_INPUT_KEYS || '', 10) || 200,
  maxArrayLength: Number.parseInt(env.MAX_INPUT_ARRAY_LENGTH || '', 10) || 2000,
  maxStringLength: Number.parseInt(env.MAX_INPUT_STRING_LENGTH || '', 10) || 10000,
});

const sanitizePayload = (payload, label, options) => {
  const state = { ok: true, reason: null };
  const sanitized = sanitizeValue(payload, 0, options, state);
  if (!state.ok) {
    return { ok: false, error: `Invalid ${label}` };
  }
  return { ok: true, value: sanitized };
};

export const validationMiddleware = (req, res, next) => {
  try {
    const options = buildOptions();
    const bodyResult = sanitizePayload(req.body, 'body', options);
    if (!bodyResult.ok) return res.status(400).json({ error: bodyResult.error });
    req.body = bodyResult.value;

    const queryResult = sanitizePayload(req.query, 'query', options);
    if (!queryResult.ok) return res.status(400).json({ error: queryResult.error });
    req.query = queryResult.value;

    const paramsResult = sanitizePayload(req.params, 'params', options);
    if (!paramsResult.ok) return res.status(400).json({ error: paramsResult.error });
    req.params = paramsResult.value;

    next();
  } catch (error) {
    next(error);
  }
};

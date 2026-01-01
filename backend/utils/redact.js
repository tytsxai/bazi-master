const REDACT_PATTERNS = [
  /password/i,
  /passphrase/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /api[-_]?key/i,
  /session/i,
  /refresh/i,
];

const shouldRedact = (key) => REDACT_PATTERNS.some((pattern) => pattern.test(key));

export const redactSensitive = (value, depth = 0, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth > 5) return '[Truncated]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1, seen));
  }
  const output = {};
  for (const [key, val] of Object.entries(value)) {
    output[key] = shouldRedact(key) ? '[REDACTED]' : redactSensitive(val, depth + 1, seen);
  }
  return output;
};

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const envLevel = (process.env.LOG_LEVEL || '').trim();
const logLevel = envLevel || (isProduction ? 'info' : 'debug');

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Backstop against secrets reaching the log stream. redactSensitive() is applied at
  // specific call sites, but any other `logger.info({ user })` would otherwise write
  // password hashes, cookies or tokens verbatim — permanently, and to a file someone
  // else may read.
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.authorization',
      '*.cookie',
      'req.headers.cookie',
      'req.headers.authorization',
      'request.headers.cookie',
      'request.headers.authorization',
      '*.SMTP_PASS',
      '*.SESSION_TOKEN_SECRET',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

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
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});



import pino from 'pino';

const envLevel = (import.meta.env.VITE_LOG_LEVEL || '').trim();
const logLevel = envLevel || (import.meta.env.MODE === 'production' ? 'info' : 'debug');

const logger = pino({
  level: logLevel,
  browser: {
    asObject: true,
  },
});

export default logger;

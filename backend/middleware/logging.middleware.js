import { logger } from '../config/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

const getRequestUrl = (req) => req?.originalUrl || req?.url || '';

const logRequestStart = ({ req, requestId }) => {
  if (isProduction) {
    logger.info(
      {
        event: 'request.start',
        requestId,
        method: req.method,
        url: getRequestUrl(req),
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
      'Request started'
    );
    return;
  }

  logger.info(`--> ${req.method} ${getRequestUrl(req)} [${requestId}]`);
};

const logRequestFinish = ({ req, res, requestId, durationMs }) => {
  const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

  if (isProduction) {
    logger[logLevel](
      {
        event: 'request.finish',
        requestId,
        method: req.method,
        url: getRequestUrl(req),
        statusCode: res.statusCode,
        durationMs,
      },
      'Request completed'
    );
    return;
  }

  const statusIcon = res.statusCode >= 400 ? '!!' : '<-';
  logger[logLevel](
    `${statusIcon} ${req.method} ${getRequestUrl(req)} ${res.statusCode} ${durationMs}ms [${requestId}]`
  );
};

export const createRequestLogger = () => (req, res, next) => {
  const startTime = Date.now();
  const requestId = req.requestId || 'unknown';

  logRequestStart({ req, requestId });

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    logRequestFinish({ req, res, requestId, durationMs });
  });

  next();
};

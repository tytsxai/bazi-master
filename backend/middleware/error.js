import { logger } from '../config/logger.js';
import { redactSensitive } from '../utils/redact.js';

/**
 * Handle 404 errors (Resource Not Found)
 */
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Global Error Handler
 * Hides stack traces in production
 */
export const createGlobalErrorHandler =
  ({ loggerInstance = logger, env = process.env } = {}) =>
  (err, req, res, next) => {
    void next;
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    const requestId = req?.id || req?.requestId;
    const isProduction = env.NODE_ENV === 'production';
    const responseMessage = isProduction && statusCode >= 500 ? 'Internal Server Error' : message;

    // Log the error
    loggerInstance.error(
      {
        err,
        req: {
          id: requestId,
          method: req.method,
          url: req.originalUrl,
          body: redactSensitive(req.body),
          query: redactSensitive(req.query),
          params: redactSensitive(req.params),
        },
      },
      message
    );

    res.status(statusCode).json({
      status: 'error',
      statusCode,
      message: responseMessage,
      ...(!isProduction && { stack: err.stack }),
    });
  };

export const globalErrorHandler = createGlobalErrorHandler();

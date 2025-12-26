import { logger } from '../config/logger.js';

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
export const globalErrorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Log the error
    logger.error({
        err,
        req: {
            method: req.method,
            url: req.originalUrl,
            body: req.body,
            query: req.query,
            params: req.params,
        },
    }, message);

    res.status(statusCode).json({
        status: 'error',
        statusCode,
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
};

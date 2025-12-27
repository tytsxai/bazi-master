import { logger } from '../config/logger.js';

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

const redactSensitive = (value, depth = 0, seen = new WeakSet()) => {
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
        output[key] = shouldRedact(key)
            ? '[REDACTED]'
            : redactSensitive(val, depth + 1, seen);
    }
    return output;
};

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
export const createGlobalErrorHandler = ({ loggerInstance = logger, env = process.env } = {}) =>
    (err, req, res, next) => {
        const statusCode = err.statusCode || 500;
        const message = err.message || 'Internal Server Error';
        const requestId = req?.id || req?.requestId;

        // Log the error
        loggerInstance.error({
            err,
            req: {
                id: requestId,
                method: req.method,
                url: req.originalUrl,
                body: redactSensitive(req.body),
                query: redactSensitive(req.query),
                params: redactSensitive(req.params),
            },
        }, message);

        res.status(statusCode).json({
            status: 'error',
            statusCode,
            message,
            ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
        });
    };

export const globalErrorHandler = createGlobalErrorHandler();

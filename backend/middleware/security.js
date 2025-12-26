import cors from 'cors';
import helmet from 'helmet';

export const createCorsMiddleware = (allowedOrigins) => {
  return cors({
    origin: (origin, callback) => {
      if (allowedOrigins.has(origin) || !origin) {
        return callback(null, true);
      }
      const error = new Error('Not allowed by CORS');
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  });
};

export const helmetMiddleware = helmet();

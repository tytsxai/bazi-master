import { isUrlTooLong } from '../utils/validation.js';

export const urlLengthMiddleware = (req, res, next) => {
  if (isUrlTooLong(req)) {
    return res.status(414).json({ error: 'Request-URI Too Long' });
  }
  return next();
};

export const isUrlTooLong = (req) => {
  const url = req?.originalUrl || req?.url || '';
  const MAX_URL_LENGTH = parseInt(process.env.MAX_URL_LENGTH, 10) || 16384;
  return url.length > MAX_URL_LENGTH;
};

export const urlLengthMiddleware = (req, res, next) => {
  if (isUrlTooLong(req)) {
    return res.status(414).json({ error: 'Request-URI Too Long' });
  }
  return next();
};

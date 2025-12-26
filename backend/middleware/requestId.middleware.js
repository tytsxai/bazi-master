import crypto from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export const getRequestId = (req) => {
  const headerValue = req.headers[REQUEST_ID_HEADER];
  if (typeof headerValue === 'string' && headerValue.trim() !== '') {
    return headerValue.trim();
  }
  if (Array.isArray(headerValue) && headerValue.length > 0 && headerValue[0].trim() !== '') {
    return headerValue[0].trim();
  }
  return crypto.randomUUID();
};

export const requestIdMiddleware = (req, res, next) => {
  const requestId = getRequestId(req);
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

export const isExpressRouter = (value) =>
  typeof value === 'function'
  && typeof value.handle === 'function'
  && typeof value.use === 'function';

export const wrapAsyncMiddleware = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const patchExpressAsync = (target) => {
  const originalMethods = ['get', 'post', 'put', 'delete', 'patch', 'use'];
  for (const method of originalMethods) {
    if (typeof target[method] === 'function') {
      const original = target[method];
      target[method] = (...args) => {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'function' && lastArg.length === 3) {
          // Async middleware
          args[args.length - 1] = wrapAsyncMiddleware(lastArg);
        }
        return original.apply(target, args);
      };
    }
  }
};




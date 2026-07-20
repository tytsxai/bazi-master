export const isExpressRouter = (value) =>
  typeof value === 'function' &&
  typeof value.handle === 'function' &&
  typeof value.use === 'function';

export const wrapAsyncMiddleware = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const PATCHED = Symbol('patchExpressAsync');
const ROUTING_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'use', 'all', 'head', 'options'];

// Express 4 does not forward a rejected promise from a handler to the error middleware:
// it becomes an unhandledRejection, the client never gets a response, and our
// process-level handler treats it as fatal. So every handler gets wrapped.
//
// Arity matters here. A handler declared `async (req, res)` has length 2 and an error
// handler has length 4 — only the latter must be left alone, since wrapping it would
// change how Express classifies it.
const shouldWrap = (value) => typeof value === 'function' && value.length < 4 && !value[PATCHED];

const wrapRoutingArgs = (args) =>
  args.map((arg) => {
    if (!shouldWrap(arg)) return arg;
    // Routers are functions too, but they are already patched at construction time and
    // must be passed through untouched.
    if (isExpressRouter(arg)) return arg;
    const wrapped = wrapAsyncMiddleware(arg);
    wrapped[PATCHED] = true;
    return wrapped;
  });

export const patchExpressAsync = (target) => {
  if (!target || target[PATCHED]) return target;
  for (const method of ROUTING_METHODS) {
    if (typeof target[method] !== 'function') continue;
    const original = target[method];
    target[method] = (...args) => original.apply(target, wrapRoutingArgs(args));
  }
  try {
    target[PATCHED] = true;
  } catch {
    // Frozen targets are fine; the methods above are already patched.
  }
  return target;
};

// Routers are created inside each route module at import time, so the patch has to be
// installed on the factory before those modules are evaluated.
export const installExpressAsyncPatch = (express) => {
  if (!express || express.Router?.[PATCHED]) return express;
  const OriginalRouter = express.Router;
  const PatchedRouter = (...args) => patchExpressAsync(OriginalRouter(...args));
  Object.assign(PatchedRouter, OriginalRouter);
  PatchedRouter[PATCHED] = true;
  express.Router = PatchedRouter;
  return express;
};

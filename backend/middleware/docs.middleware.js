import crypto from 'crypto';

// Lives here rather than in the (now deleted) auth middleware: this is the only credential
// check left in the service, and it has nothing to do with a user — there are no users.
// It gates the interactive docs so a production deployment does not hand a full request
// builder to anyone who finds the host.
const timingSafeEqualDigest = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hash first so both sides are the same length; timingSafeEqual throws otherwise.
  const left = crypto.createHash('sha256').update(a, 'utf8').digest();
  const right = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
};

export const docsBasicAuth = (req, res, next) => {
  const validUser = process.env.DOCS_USER || 'admin';
  const validPassword = process.env.DOCS_PASSWORD;

  if (!validPassword) {
    // Unconfigured means "not exposed" in production. Failing closed is deliberate: the
    // alternative silently publishes the docs the first time someone forgets the variable.
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).send('Docs authentication not configured.');
    }
    return next();
  }

  // Reject non-HTTPS requests in production to protect Basic Auth credentials in transit.
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    if (proto !== 'https') {
      return res.status(403).send('HTTPS required.');
    }
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="API Docs"');
    return res.status(401).send('Authentication required.');
  }

  const [user, password] = Buffer.from(auth.split(' ')[1] || '', 'base64')
    .toString()
    .split(':');

  if (timingSafeEqualDigest(user, validUser) && timingSafeEqualDigest(password, validPassword)) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="API Docs"');
  return res.status(401).send('Invalid credentials.');
};

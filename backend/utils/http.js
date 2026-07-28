/**
 * fetch with a hard deadline.
 *
 * Bare fetch has no timeout. When an upstream (an AI provider, an OAuth token
 * endpoint) stops responding rather than refusing, the request stays open until the
 * server's own request timeout — which defaults to 300s in Node — and connections pile
 * up behind it. Every outbound call should carry a deadline.
 */
export const fetchWithTimeout = async (url, options, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetch(url, options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * fetch for a streamed response, with a deadline that survives the response headers.
 *
 * fetchWithTimeout only guards the part up to the headers — it clears its timer as soon
 * as fetch() resolves. For a streamed response that is the easy half: a provider that
 * sends the headers, emits a few tokens and then stalls leaves the read loop awaiting a
 * chunk that never arrives, with nothing left armed to abort it. The request then hangs
 * for the life of the process, holding its socket and (for /ws/ai) the caller's
 * single-in-flight AI slot, so that user cannot start another request until a restart.
 *
 * Returns the response plus two callbacks: `touch()` restarts the idle countdown and
 * must be called for every chunk received, and `release()` disarms it once the stream
 * ends. Aborting rejects the pending read(), which surfaces as a normal request failure.
 */
export const fetchStreamWithTimeout = async (
  url,
  options,
  { connectTimeoutMs, idleTimeoutMs } = {}
) => {
  const connectMs =
    Number.isFinite(connectTimeoutMs) && connectTimeoutMs > 0 ? connectTimeoutMs : 0;
  const idleMs = Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : 0;

  if (!connectMs && !idleMs) {
    return { response: await fetch(url, options), touch: () => {}, release: () => {} };
  }

  const controller = new AbortController();
  let timer = connectMs ? setTimeout(() => controller.abort(), connectMs) : null;

  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const touch = () => {
    release();
    if (idleMs) timer = setTimeout(() => controller.abort(), idleMs);
  };

  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    release();
    throw error;
  }

  touch();
  return { response, touch, release };
};

/** Deadline for OAuth token and profile calls. */
export const OAUTH_FETCH_TIMEOUT_MS = Number(process.env.OAUTH_FETCH_TIMEOUT_MS) || 10000;

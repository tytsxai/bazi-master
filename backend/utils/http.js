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

/** Deadline for OAuth token and profile calls. */
export const OAUTH_FETCH_TIMEOUT_MS = Number(process.env.OAUTH_FETCH_TIMEOUT_MS) || 10000;

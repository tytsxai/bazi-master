import { createSessionStore } from './session.service.js';

/**
 * Records, per user, the moment their credentials last changed.
 *
 * Sessions are keyed by token, so there is no way to enumerate and delete every session
 * belonging to one user. That meant a password reset did not log anyone out: an
 * attacker holding a stolen session token kept it, and the victim's one self-service
 * remedy did nothing.
 *
 * Auth tokens carry a signed issuedAt, so comparing it against this timestamp revokes
 * every token minted before the change without needing a schema migration or a
 * user-to-token index. Entries are mirrored to Redis so the decision is consistent
 * across instances, and expire with the maximum token lifetime — past that point every
 * affected token is invalid on its own.
 */
const MAX_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const credentialRevocationStore = createSessionStore({ ttlMs: MAX_TOKEN_TTL_MS });

export const setCredentialRevocationMirror = (mirror) => {
  credentialRevocationStore.setMirror(mirror);
};

export const CREDENTIAL_REVOCATION_TTL_MS = MAX_TOKEN_TTL_MS;

const toKey = (userId) => `user:${userId}`;

export const markCredentialsChanged = async (userId, at = Date.now()) => {
  if (!Number.isFinite(userId)) return;
  await credentialRevocationStore.setAsync(toKey(userId), at);
};

export const getCredentialsChangedAtAsync = async (userId) => {
  if (!Number.isFinite(userId)) return null;
  const value = await credentialRevocationStore.getAsync(toKey(userId));
  return Number.isFinite(value) ? value : null;
};

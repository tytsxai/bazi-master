import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOauthState, buildOauthRedirectUrl } from '../services/oauth.service.js';

describe('OAuth Service V2', () => {
  it('buildOauthState returns token', () => {
    const state = buildOauthState('/next');
    assert.ok(state);
    assert.equal(typeof state, 'string');
  });

  it('buildOauthRedirectUrl constructs url', () => {
    const url = buildOauthRedirectUrl({ success: true, frontendUrl: 'http://loc' });
    assert.ok(url.includes('oauth=success'));
  });
});

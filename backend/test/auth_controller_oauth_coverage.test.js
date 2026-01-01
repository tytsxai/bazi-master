import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../config/prisma.js';
import { oauthStateStore, buildOauthState } from '../services/oauth.service.js';
import * as auth from '../controllers/auth.controller.js';

const mockRes = () => {
  const res = {
    statusCode: null,
    body: null,
    redirectUrl: null,
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.redirect = (url) => {
    res.redirectUrl = url;
    return res;
  };
  res.cookie = () => res;
  res.clearCookie = () => res;
  return res;
};

const withEnv = async (patch, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withMockFetch = async (mockFetch, run) => {
  const prev = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = prev;
  }
};

describe('Auth controller OAuth & reset coverage', () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('password reset request/confirm covers token lifecycle branches', async () => {
    const email = `reset_${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, password: 'plain', name: 'Reset User' },
    });

    try {
      // request: invalid email still returns generic message
      {
        const res = mockRes();
        await auth.handlePasswordResetRequest({ body: { email: 'bad' } }, res);
        assert.equal(res.statusCode, null);
        assert.ok(res.body?.message);
      }

      // request: existing user creates token and replaces existing token
      {
        auth.resetTokenStore.clear();
        auth.resetTokenByUser.clear();

        const res1 = mockRes();
        await auth.handlePasswordResetRequest({ body: { email } }, res1);
        assert.ok(auth.resetTokenByUser.get(user.id));
        const firstToken = auth.resetTokenByUser.get(user.id);

        const res2 = mockRes();
        await auth.handlePasswordResetRequest({ body: { email } }, res2);
        const secondToken = auth.resetTokenByUser.get(user.id);
        assert.ok(secondToken);
        assert.notEqual(firstToken, secondToken);
        assert.equal(auth.resetTokenStore.has(firstToken), false);

        // confirm: missing token
        {
          const res = mockRes();
          await auth.handlePasswordResetConfirm({ body: { token: '', password: 'abcdef' } }, res);
          assert.equal(res.statusCode, 400);
        }
        // confirm: invalid password
        {
          const res = mockRes();
          await auth.handlePasswordResetConfirm(
            { body: { token: secondToken, password: '1' } },
            res
          );
          assert.equal(res.statusCode, 400);
        }
        // confirm: invalid token
        {
          const res = mockRes();
          await auth.handlePasswordResetConfirm(
            { body: { token: 'nope', password: 'abcdef' } },
            res
          );
          assert.equal(res.statusCode, 400);
        }
        // confirm: expired entry
        {
          const expired = 'expired-token';
          auth.resetTokenStore.set(expired, { userId: user.id, expiresAt: Date.now() - 1 });
          const res = mockRes();
          await auth.handlePasswordResetConfirm(
            { body: { token: expired, password: 'abcdef' } },
            res
          );
          assert.equal(res.statusCode, 400);
          assert.equal(auth.resetTokenStore.has(expired), false);
        }
        // confirm: user missing
        {
          const ghost = 'ghost-token';
          auth.resetTokenStore.set(ghost, { userId: 99999999, expiresAt: Date.now() + 10000 });
          auth.resetTokenByUser.set(99999999, ghost);
          const res = mockRes();
          await auth.handlePasswordResetConfirm(
            { body: { token: ghost, password: 'abcdef' } },
            res
          );
          assert.equal(res.statusCode, 400);
          assert.equal(auth.resetTokenStore.has(ghost), false);
          assert.equal(auth.resetTokenByUser.has(99999999), false);
        }

        // confirm: success path clears stores
        {
          const res = mockRes();
          await auth.handlePasswordResetConfirm(
            { body: { token: secondToken, password: 'abcdef' } },
            res
          );
          assert.equal(res.statusCode, null);
          assert.equal(res.body?.status, 'ok');
          assert.equal(auth.resetTokenStore.has(secondToken), false);
          assert.equal(auth.resetTokenByUser.has(user.id), false);
        }
      }
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it('Google callback covers invalid state, query error, missing code, and not configured branches', async () => {
    {
      const res = mockRes();
      await auth.handleGoogleCallback({ query: {} }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=invalid_state'));
    }

    {
      const res = mockRes();
      await auth.handleGoogleCallback({ query: { state: 'missing', error: 'access_denied' } }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=access_denied'));
    }

    {
      const state = buildOauthState('/home');
      const res = mockRes();
      await auth.handleGoogleCallback({ query: { state } }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=missing_code'));
    }

    {
      const state = buildOauthState('/home');
      const res = mockRes();
      await auth.handleGoogleCallback({ query: { state, code: 'x' } }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=not_configured'));
    }

    oauthStateStore.clear();
  });

  it('WeChat callback covers missing params, invalid state, and not configured branches', async () => {
    {
      const res = mockRes();
      await auth.handleWeChatCallback({ query: {} }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=wechat_missing_params'));
    }

    {
      const res = mockRes();
      await auth.handleWeChatCallback({ query: { code: 'c', state: 'missing' } }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=wechat_invalid_state'));
    }

    {
      const state = buildOauthState('/home');
      const res = mockRes();
      await auth.handleWeChatCallback({ query: { code: 'c', state } }, res);
      assert.ok(res.redirectUrl);
      assert.ok(res.redirectUrl.includes('error=wechat_not_configured'));
    }

    oauthStateStore.clear();
  });

  it('Google callback covers configured fetch branches (token/profile success + errors)', async () => {
    const email = `google_${Date.now()}@example.com`;
    await prisma.user.deleteMany({ where: { email } });

    await withEnv(
      {
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/auth/google/callback',
        FRONTEND_URL: 'http://localhost:3000',
      },
      async () => {
        // token endpoint not ok
        await withMockFetch(
          async () => ({
            ok: false,
            status: 500,
            async text() {
              return 'nope';
            },
            async json() {
              return {};
            },
          }),
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleGoogleCallback({ query: { state, code: 'x' } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=server_error'));
          }
        );

        // token ok but missing access token
        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async json() {
              return {};
            },
            async text() {
              return '';
            },
          }),
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleGoogleCallback({ query: { state, code: 'x' } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=server_error'));
          }
        );

        // profile not ok
        let call = 0;
        await withMockFetch(
          async () => {
            call++;
            if (call === 1)
              return {
                ok: true,
                status: 200,
                async json() {
                  return { access_token: 't' };
                },
                async text() {
                  return '';
                },
              };
            return {
              ok: false,
              status: 500,
              async json() {
                return {};
              },
              async text() {
                return 'bad';
              },
            };
          },
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleGoogleCallback({ query: { state, code: 'x' } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=server_error'));
          }
        );

        // profile ok but missing email
        call = 0;
        await withMockFetch(
          async () => {
            call++;
            if (call === 1)
              return {
                ok: true,
                status: 200,
                async json() {
                  return { access_token: 't' };
                },
                async text() {
                  return '';
                },
              };
            return {
              ok: true,
              status: 200,
              async json() {
                return { name: 'No Email' };
              },
              async text() {
                return '';
              },
            };
          },
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleGoogleCallback({ query: { state, code: 'x' } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=missing_email'));
          }
        );

        // success: creates user and redirects with oauth success
        call = 0;
        await withMockFetch(
          async () => {
            call++;
            if (call === 1)
              return {
                ok: true,
                status: 200,
                async json() {
                  return { access_token: 't' };
                },
                async text() {
                  return '';
                },
              };
            return {
              ok: true,
              status: 200,
              async json() {
                return { email, name: 'Google User' };
              },
              async text() {
                return '';
              },
            };
          },
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleGoogleCallback({ query: { state, code: 'x' } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('oauth=success'));
          }
        );
      }
    );

    oauthStateStore.clear();
    await prisma.user.deleteMany({ where: { email } });
  });

  it('WeChat callback covers configured fetch branches (token/profile success + errors)', async () => {
    const openId = `id_${Date.now()}`;
    const email = `wechat_${openId}@wechat.local`;
    await prisma.user.deleteMany({ where: { email } });

    await withEnv(
      {
        WECHAT_APP_ID: 'id',
        WECHAT_APP_SECRET: 'secret',
        WECHAT_REDIRECT_URI: 'http://localhost:4000/api/auth/wechat/callback',
        WECHAT_FRONTEND_URL: 'http://localhost:3000',
      },
      async () => {
        // token endpoint not ok
        await withMockFetch(
          async () => ({
            ok: false,
            status: 500,
            async json() {
              return {};
            },
            async text() {
              return 'nope';
            },
          }),
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleWeChatCallback({ query: { code: 'c', state } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=wechat_token_failed'));
          }
        );

        // token ok but missing access_token
        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async json() {
              return { openid: openId };
            },
            async text() {
              return '';
            },
          }),
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleWeChatCallback({ query: { code: 'c', state } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=wechat_token_failed'));
          }
        );

        // token ok but missing openid
        await withMockFetch(
          async () => ({
            ok: true,
            status: 200,
            async json() {
              return { access_token: 't' };
            },
            async text() {
              return '';
            },
          }),
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleWeChatCallback({ query: { code: 'c', state } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=wechat_missing_openid'));
          }
        );

        // profile not ok
        let call = 0;
        await withMockFetch(
          async () => {
            call++;
            if (call === 1)
              return {
                ok: true,
                status: 200,
                async json() {
                  return { access_token: 't', openid: openId };
                },
                async text() {
                  return '';
                },
              };
            return {
              ok: false,
              status: 500,
              async json() {
                return {};
              },
              async text() {
                return 'bad';
              },
            };
          },
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleWeChatCallback({ query: { code: 'c', state } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('error=wechat_oauth_failed'));
          }
        );

        // success: creates user and redirects with oauth success
        call = 0;
        await withMockFetch(
          async () => {
            call++;
            if (call === 1)
              return {
                ok: true,
                status: 200,
                async json() {
                  return { access_token: 't', openid: openId };
                },
                async text() {
                  return '';
                },
              };
            return {
              ok: true,
              status: 200,
              async json() {
                return { nickname: 'WeChat User' };
              },
              async text() {
                return '';
              },
            };
          },
          async () => {
            const state = buildOauthState('/home');
            const res = mockRes();
            await auth.handleWeChatCallback({ query: { code: 'c', state } }, res);
            assert.ok(res.redirectUrl);
            assert.ok(res.redirectUrl.includes('oauth=success'));
          }
        );
      }
    );

    oauthStateStore.clear();
    await prisma.user.deleteMany({ where: { email } });
  });
});

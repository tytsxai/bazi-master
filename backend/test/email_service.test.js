import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { ensurePasswordResetDeliveryReady } from '../services/email.service.js';

const originalEnv = { ...process.env };

describe('email service', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('password reset enabled flag accepts common false values', () => {
    process.env.NODE_ENV = 'production';

    for (const value of ['false', 'FALSE', '0']) {
      process.env.PASSWORD_RESET_ENABLED = value;
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_FROM;

      const result = ensurePasswordResetDeliveryReady();
      assert.deepEqual(result, { ok: false, reason: 'disabled' });
    }
  });
});

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../config/prisma.js';
import { hashPassword, verifyPassword, isHashedPassword } from '../utils/passwords.js';
import { ensureDefaultUser } from '../services/schema.service.js';

describe('Schema default user seeding coverage', () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('ensureDefaultUser creates and updates seeded user based on env', async () => {
    const email = `seed_${Date.now()}@example.com`;
    const password = 'Password123!';
    const name = 'Seeded Name';

    const prev = {
      SEED_USER_EMAIL: process.env.SEED_USER_EMAIL,
      SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD,
      SEED_USER_NAME: process.env.SEED_USER_NAME,
      SEED_DEFAULT_USER: process.env.SEED_DEFAULT_USER,
    };

    try {
      process.env.SEED_DEFAULT_USER = 'true';
      process.env.SEED_USER_EMAIL = email;
      process.env.SEED_USER_PASSWORD = password;
      process.env.SEED_USER_NAME = name;

      await prisma.user.deleteMany({ where: { email } });
      await ensureDefaultUser();

      const created = await prisma.user.findUnique({ where: { email } });
      assert.ok(created);
      assert.equal(created.name, name);
      assert.equal(isHashedPassword(created.password), true);
      assert.equal(await verifyPassword(password, created.password), true);

      // Update path: make name/password mismatch and ensure it is corrected.
      await prisma.user.update({
        where: { email },
        data: { name: 'Different', password: 'plain' },
      });
      await ensureDefaultUser();

      const updated = await prisma.user.findUnique({ where: { email } });
      assert.ok(updated);
      assert.equal(updated.name, name);
      assert.equal(isHashedPassword(updated.password), true);
      assert.equal(await verifyPassword(password, updated.password), true);
    } finally {
      if (prev.SEED_DEFAULT_USER === undefined) delete process.env.SEED_DEFAULT_USER;
      else process.env.SEED_DEFAULT_USER = prev.SEED_DEFAULT_USER;
      if (prev.SEED_USER_EMAIL === undefined) delete process.env.SEED_USER_EMAIL;
      else process.env.SEED_USER_EMAIL = prev.SEED_USER_EMAIL;
      if (prev.SEED_USER_PASSWORD === undefined) delete process.env.SEED_USER_PASSWORD;
      else process.env.SEED_USER_PASSWORD = prev.SEED_USER_PASSWORD;
      if (prev.SEED_USER_NAME === undefined) delete process.env.SEED_USER_NAME;
      else process.env.SEED_USER_NAME = prev.SEED_USER_NAME;
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it('ensureDefaultUser warns and skips when seed env is missing', async () => {
    const prev = {
      SEED_USER_EMAIL: process.env.SEED_USER_EMAIL,
      SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD,
      SEED_USER_NAME: process.env.SEED_USER_NAME,
      SEED_DEFAULT_USER: process.env.SEED_DEFAULT_USER,
    };

    const warns = [];
    const warnMock = mock.method(console, 'warn', (...args) => {
      warns.push(args.map(String).join(' '));
    });

    try {
      process.env.SEED_DEFAULT_USER = 'true';
      delete process.env.SEED_USER_EMAIL;
      delete process.env.SEED_USER_PASSWORD;
      delete process.env.SEED_USER_NAME;

      await ensureDefaultUser();
      assert.ok(warns.some((line) => line.includes('Skipping default user seed')));
    } finally {
      warnMock.mock.restore();
      if (prev.SEED_DEFAULT_USER === undefined) delete process.env.SEED_DEFAULT_USER;
      else process.env.SEED_DEFAULT_USER = prev.SEED_DEFAULT_USER;
      if (prev.SEED_USER_EMAIL === undefined) delete process.env.SEED_USER_EMAIL;
      else process.env.SEED_USER_EMAIL = prev.SEED_USER_EMAIL;
      if (prev.SEED_USER_PASSWORD === undefined) delete process.env.SEED_USER_PASSWORD;
      else process.env.SEED_USER_PASSWORD = prev.SEED_USER_PASSWORD;
      if (prev.SEED_USER_NAME === undefined) delete process.env.SEED_USER_NAME;
      else process.env.SEED_USER_NAME = prev.SEED_USER_NAME;
    }
  });

  it('ensureDefaultUser is a no-op when user already matches seed', async () => {
    const email = `seed_noop_${Date.now()}@example.com`;
    const password = 'Password123!';
    const name = 'Already Seeded';

    const prev = {
      SEED_USER_EMAIL: process.env.SEED_USER_EMAIL,
      SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD,
      SEED_USER_NAME: process.env.SEED_USER_NAME,
      SEED_DEFAULT_USER: process.env.SEED_DEFAULT_USER,
    };

    try {
      process.env.SEED_DEFAULT_USER = 'true';
      process.env.SEED_USER_EMAIL = email;
      process.env.SEED_USER_PASSWORD = password;
      process.env.SEED_USER_NAME = name;

      const hashed = await hashPassword(password);
      assert.ok(hashed);

      await prisma.user.deleteMany({ where: { email } });
      await prisma.user.create({ data: { email, password: hashed, name } });

      await ensureDefaultUser();

      const user = await prisma.user.findUnique({ where: { email } });
      assert.ok(user);
      assert.equal(user.name, name);
      assert.equal(user.password, hashed);
      assert.equal(await verifyPassword(password, user.password), true);
    } finally {
      if (prev.SEED_DEFAULT_USER === undefined) delete process.env.SEED_DEFAULT_USER;
      else process.env.SEED_DEFAULT_USER = prev.SEED_DEFAULT_USER;
      if (prev.SEED_USER_EMAIL === undefined) delete process.env.SEED_USER_EMAIL;
      else process.env.SEED_USER_EMAIL = prev.SEED_USER_EMAIL;
      if (prev.SEED_USER_PASSWORD === undefined) delete process.env.SEED_USER_PASSWORD;
      else process.env.SEED_USER_PASSWORD = prev.SEED_USER_PASSWORD;
      if (prev.SEED_USER_NAME === undefined) delete process.env.SEED_USER_NAME;
      else process.env.SEED_USER_NAME = prev.SEED_USER_NAME;
      await prisma.user.deleteMany({ where: { email } });
    }
  });
});

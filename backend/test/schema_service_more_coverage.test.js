import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEnsureSoftDeleteReady,
  ensureBaziRecordTrashTable,
  ensureBaziRecordUpdatedAt,
  ensureDefaultUser,
  ensureSoftDeleteTables,
  ensureUserSettingsTable,
  ensureZiweiHistoryTable,
} from '../services/schema.service.js';

describe('schema.service more coverage', () => {
  it('ensureSoftDeleteTables early returns in production or when ALLOW_RUNTIME_SCHEMA_SYNC=false', async () => {
    const calls = [];
    const prismaClient = { $executeRaw: async () => calls.push('exec') };

    await ensureSoftDeleteTables({
      prismaClient,
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: true },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
    });
    assert.deepEqual(calls, []);

    await ensureSoftDeleteTables({
      prismaClient,
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'false' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
    });
    assert.deepEqual(calls, []);
  });

  it('ensureSoftDeleteTables runs for sqlite and postgres configs', async () => {
    const calls = [];
    const prismaClient = { $executeRaw: async () => calls.push('exec') };

    await ensureSoftDeleteTables({
      prismaClient,
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
    });
    await ensureSoftDeleteTables({
      prismaClient,
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
    });

    assert.deepEqual(calls, ['exec', 'exec']);
  });

  it('ensureBaziRecordTrashTable covers postgres success and error branches', async () => {
    const calls = [];
    const logger = {
      errors: [],
      error(...args) {
        this.errors.push(args.map(String).join(' '));
      },
    };

    await ensureBaziRecordTrashTable({
      prismaClient: { $executeRaw: async () => calls.push('exec') },
      env: {},
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
      logger,
    });
    assert.equal(calls.length, 2);

    await ensureBaziRecordTrashTable({
      prismaClient: {
        $executeRaw: async () => {
          throw new Error('boom');
        },
      },
      env: {},
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
      logger,
    });
    assert.ok(
      logger.errors.some((line) => line.includes('Failed to ensure BaziRecordTrash table'))
    );

    await assert.rejects(
      () =>
        ensureBaziRecordTrashTable({
          prismaClient: {
            $executeRaw: async () => {
              throw new Error('boom');
            },
          },
          env: {},
          appConfig: { IS_PRODUCTION: true },
          prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
          logger,
        }),
      /boom/
    );
  });

  it('createEnsureSoftDeleteReady caches promise and propagates error', async () => {
    {
      const calls = [];
      const ready = createEnsureSoftDeleteReady({
        prismaClient: { $executeRaw: async () => calls.push('exec') },
        env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
        appConfig: { IS_PRODUCTION: false },
        prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      });

      const p1 = ready();
      const p2 = ready();
      assert.equal(p1, p2);
      await p1;
      assert.equal(calls.length, 1);
    }

    {
      const logger = {
        errors: [],
        error(...args) {
          this.errors.push(args.map(String).join(' '));
        },
      };

      const ready = createEnsureSoftDeleteReady({
        prismaClient: {
          $executeRaw: async () => {
            throw new Error('db');
          },
        },
        env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
        appConfig: { IS_PRODUCTION: false },
        prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
        logger,
      });

      const p = ready();
      await assert.rejects(() => p, /db/);
      await assert.rejects(() => ready(), /db/);
      assert.ok(logger.errors.some((line) => line.includes('Failed to ensure soft delete tables')));
    }
  });

  it('ensureUserSettingsTable / ensureZiweiHistoryTable cover early return and catch', async () => {
    const calls = [];
    const logger = {
      errors: [],
      error(...args) {
        this.errors.push(args.map(String).join(' '));
      },
    };

    await ensureUserSettingsTable({
      prismaClient: { $executeRaw: async () => calls.push('exec') },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'false' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });
    await ensureZiweiHistoryTable({
      prismaClient: { $executeRaw: async () => calls.push('exec') },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'false' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });
    assert.deepEqual(calls, []);

    await ensureUserSettingsTable({
      prismaClient: {
        $executeRaw: async () => {
          throw new Error('boom');
        },
      },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });
    await ensureZiweiHistoryTable({
      prismaClient: {
        $executeRaw: async () => {
          throw new Error('boom');
        },
      },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });

    // Postgres branches
    await ensureUserSettingsTable({
      prismaClient: { $executeRaw: async () => calls.push('pg_settings') },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
      logger,
    });
    await ensureZiweiHistoryTable({
      prismaClient: { $executeRaw: async () => calls.push('pg_ziwei') },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
      logger,
    });

    assert.ok(logger.errors.some((line) => line.includes('Failed to ensure UserSettings table')));
    assert.ok(logger.errors.some((line) => line.includes('Failed to ensure ZiweiRecord table')));
    assert.ok(calls.includes('pg_settings'));
    assert.ok(calls.includes('pg_ziwei'));
  });

  it('ensureBaziRecordUpdatedAt covers sqlite/postgres paths and error catch', async () => {
    const execCalls = [];
    const logger = {
      errors: [],
      error(...args) {
        this.errors.push(args.map(String).join(' '));
      },
    };

    // sqlite: already has updatedAt -> no executeRaw
    await ensureBaziRecordUpdatedAt({
      prismaClient: {
        $queryRaw: async () => [{ name: 'updatedAt' }],
        $executeRaw: async () => execCalls.push('exec'),
      },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });
    assert.deepEqual(execCalls, []);

    // sqlite: missing updatedAt -> alter + update
    await ensureBaziRecordUpdatedAt({
      prismaClient: {
        $queryRaw: async () => [{ name: 'id' }],
        $executeRaw: async () => execCalls.push('exec'),
      },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });
    assert.equal(execCalls.length, 2);

    // postgres: missing updatedAt -> alter + update
    await ensureBaziRecordUpdatedAt({
      prismaClient: {
        $queryRaw: async () => [],
        $executeRaw: async () => execCalls.push('exec'),
      },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: false, IS_POSTGRES: true },
      logger,
    });
    assert.equal(execCalls.length, 4);

    // catch branch
    await ensureBaziRecordUpdatedAt({
      prismaClient: {
        $queryRaw: async () => {
          throw new Error('boom');
        },
        $executeRaw: async () => execCalls.push('exec'),
      },
      env: { ALLOW_RUNTIME_SCHEMA_SYNC: 'true' },
      appConfig: { IS_PRODUCTION: false },
      prismaConfig: { IS_SQLITE: true, IS_POSTGRES: false },
      logger,
    });
    assert.ok(
      logger.errors.some((line) => line.includes('Failed to ensure BaziRecord updatedAt column'))
    );
  });

  it('ensureDefaultUser covers no-op, create/update, hash failure, and catch', async () => {
    const calls = [];
    const logger = {
      errors: [],
      warns: [],
      error(...args) {
        this.errors.push(args.map(String).join(' '));
      },
      warn(...args) {
        this.warns.push(args.map(String).join(' '));
      },
    };

    // Should seed false => no-op
    await ensureDefaultUser({
      prismaClient: {
        user: {
          findUnique: async () => {
            throw new Error('should not hit');
          },
        },
      },
      env: {
        NODE_ENV: 'test',
        SEED_DEFAULT_USER: 'false',
        SEED_USER_EMAIL: 'a',
        SEED_USER_PASSWORD: 'b',
      },
      logger,
    });

    // Missing env => warn
    await ensureDefaultUser({
      prismaClient: { user: { findUnique: async () => null } },
      env: { NODE_ENV: 'test', SEED_DEFAULT_USER: 'true' },
      logger,
    });
    assert.ok(logger.warns.some((line) => line.includes('Skipping default user seed')));

    // Create path
    await ensureDefaultUser({
      prismaClient: {
        user: {
          findUnique: async () => null,
          create: async () => calls.push('create'),
        },
      },
      env: {
        NODE_ENV: 'test',
        SEED_DEFAULT_USER: 'true',
        SEED_USER_EMAIL: 'u',
        SEED_USER_PASSWORD: 'p',
        SEED_USER_NAME: 'n',
      },
      hashPasswordFn: async () => 'hashed',
      logger,
    });

    // Hash failure => no create
    await ensureDefaultUser({
      prismaClient: {
        user: {
          findUnique: async () => null,
          create: async () => calls.push('create2'),
        },
      },
      env: {
        NODE_ENV: 'test',
        SEED_DEFAULT_USER: 'true',
        SEED_USER_EMAIL: 'u',
        SEED_USER_PASSWORD: 'p',
      },
      hashPasswordFn: async () => null,
      logger,
    });

    // Update path
    await ensureDefaultUser({
      prismaClient: {
        user: {
          findUnique: async () => ({ email: 'u', password: 'plain', name: 'old' }),
          update: async () => calls.push('update'),
        },
      },
      env: {
        NODE_ENV: 'test',
        SEED_DEFAULT_USER: 'true',
        SEED_USER_EMAIL: 'u',
        SEED_USER_PASSWORD: 'p',
        SEED_USER_NAME: 'n',
      },
      verifyPasswordFn: async () => false,
      isHashedPasswordFn: () => false,
      hashPasswordFn: async () => 'hashed',
      logger,
    });

    // Catch branch
    await ensureDefaultUser({
      prismaClient: {
        user: {
          findUnique: async () => {
            throw new Error('boom');
          },
        },
      },
      env: {
        NODE_ENV: 'test',
        SEED_DEFAULT_USER: 'true',
        SEED_USER_EMAIL: 'u',
        SEED_USER_PASSWORD: 'p',
      },
      logger,
    });

    assert.deepEqual(calls, ['create', 'update']);
    assert.ok(logger.errors.some((line) => line.includes('Failed to ensure default user')));
  });
});

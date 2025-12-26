import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDatabaseUrl, readPrismaDatasourceInfo } from '../config/database.js';

describe('Database config coverage', () => {
  it('readPrismaDatasourceInfo infers provider from DATABASE_URL and schema', () => {
    const prev = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      assert.equal(readPrismaDatasourceInfo().provider, 'postgresql');

      process.env.DATABASE_URL = 'file:./some.db';
      assert.equal(readPrismaDatasourceInfo().provider, 'sqlite');

      delete process.env.DATABASE_URL;
      const info = readPrismaDatasourceInfo();
      assert.equal(info.provider, 'sqlite');
      assert.equal(info.urlUsesDatabaseUrlEnv, true);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  it('ensureDatabaseUrl does not overwrite existing or production env', () => {
    const prevUrl = process.env.DATABASE_URL;
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.DATABASE_URL = 'file:already.db';
      process.env.NODE_ENV = 'test';
      ensureDatabaseUrl();
      assert.equal(process.env.DATABASE_URL, 'file:already.db');

      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'production';
      ensureDatabaseUrl();
      assert.equal(process.env.DATABASE_URL, undefined);
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevUrl;
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
    }
  });

  it('ensureDatabaseUrl sets a sqlite url when missing', () => {
    const prevUrl = process.env.DATABASE_URL;
    const prevEnv = process.env.NODE_ENV;
    try {
      delete process.env.DATABASE_URL;
      process.env.NODE_ENV = 'test';
      ensureDatabaseUrl();
      assert.ok(process.env.DATABASE_URL);
      assert.ok(process.env.DATABASE_URL.startsWith('file:'));
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevUrl;
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
    }
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDatabaseUrl } from '../config/database.js';

ensureDatabaseUrl();

describe('Schema service coverage', () => {
  it('ensureSoftDeleteReady caches initialization', async () => {
    const { ensureSoftDeleteReady } = await import('../services/schema.service.js');

    const first = ensureSoftDeleteReady();
    const second = ensureSoftDeleteReady();
    assert.equal(typeof first?.then, 'function');
    assert.equal(typeof second?.then, 'function');

    await first;
    await second;
  });

  it('ensure schema helpers run without throwing', async () => {
    const {
      ensureBaziRecordTrashTable,
      ensureBaziRecordUpdatedAt,
      ensureSoftDeleteTables,
      ensureUserSettingsTable,
      ensureZiweiHistoryTable,
    } = await import('../services/schema.service.js');

    await ensureSoftDeleteTables();
    await ensureBaziRecordTrashTable();
    await ensureUserSettingsTable();
    await ensureZiweiHistoryTable();
    await ensureBaziRecordUpdatedAt();
  });
});

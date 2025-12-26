import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('Full export/import preserves counts', async ({ page, request }, testInfo) => {
  const testId = `e2e_full_export_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `${testId}@example.com`;
  const password = 'Passw0rd!';
  const name = `Seer ${testId}`;

  const registerResponse = await request.post('/api/register', {
    data: { email, password, name },
  });
  expect(registerResponse.ok()).toBeTruthy();

  const loginResponse = await request.post('/api/login', {
    data: { email, password },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginData = await loginResponse.json();
  const { token, user } = loginData;

  const createRecord = async (suffix, birthHour) => {
    const response = await request.post('/api/bazi/records', {
      data: {
        birthYear: 1994,
        birthMonth: 8,
        birthDay: 14,
        birthHour,
        gender: 'female',
        birthLocation: `E2E Full Export ${suffix}`,
        timezone: 'UTC',
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return data.record;
  };

  await createRecord('A', 6);
  const recordB = await createRecord('B', 7);

  const deleteResponse = await request.delete(`/api/bazi/records/${recordB.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(deleteResponse.ok()).toBeTruthy();

  const countBeforeResponse = await request.get('/api/bazi/records?status=all&pageSize=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(countBeforeResponse.ok()).toBeTruthy();
  const countBeforeData = await countBeforeResponse.json();
  const countBefore = countBeforeData.totalCount;
  expect(countBefore).toBeGreaterThan(0);

  await page.addInitScript(({ authToken, authUser }) => {
    localStorage.setItem('bazi_token', authToken);
    localStorage.setItem('bazi_user', JSON.stringify(authUser));
    localStorage.setItem('bazi_last_activity', String(Date.now()));
  }, { authToken: token, authUser: user });

  await page.goto('/history');
  const exportAllButton = page.getByRole('button', { name: 'Export all' });
  await expect(exportAllButton).toBeEnabled({ timeout: 30000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    exportAllButton.click(),
  ]);
  const downloadPath = testInfo.outputPath(`history-full-export-${testId}.json`);
  await download.saveAs(downloadPath);

  const parsed = JSON.parse(await fs.readFile(downloadPath, 'utf8'));
  const exportedRecords = Array.isArray(parsed) ? parsed : parsed?.records;
  expect(Array.isArray(exportedRecords)).toBeTruthy();
  const exportedCount = exportedRecords.length;
  expect(exportedCount).toBeGreaterThan(0);
  expect(exportedRecords.some((record) => record?.softDeleted)).toBeTruthy();
  expect(exportedRecords.some((record) => record?.birthLocation?.includes('E2E Full Export'))).toBeTruthy();

  const [importResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/bazi/records/import')
      && response.request().method() === 'POST'
    ),
    page.setInputFiles('input[type="file"]', downloadPath),
  ]);
  expect(importResponse.ok()).toBeTruthy();

  const countAfterResponse = await request.get('/api/bazi/records?status=all&pageSize=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(countAfterResponse.ok()).toBeTruthy();
  const countAfterData = await countAfterResponse.json();
  const countAfter = countAfterData.totalCount;
  expect(countAfter).toBe(countBefore + exportedCount);
});

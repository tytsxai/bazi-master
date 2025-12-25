import { test, expect } from '@playwright/test';
import axe from 'axe-core';

test('Login page has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.addScriptTag({ content: axe.source });

    const violations = await page.evaluate(async () => {
        const results = await window.axe.run({
            resultTypes: ['violations'],
        });
        return results.violations || [];
    });

    const blocking = violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact)
    );

    expect(
        blocking,
        `Accessibility violations:\n${JSON.stringify(blocking, null, 2)}`
    ).toEqual([]);
});

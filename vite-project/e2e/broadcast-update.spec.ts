import { test, expect } from '@playwright/test';
import { harness } from './harness';

test('empty history, inline settings and BO1/3/5/7 win boxes follow authoritative side swaps', async ({ browser, baseURL }) => {
  const h = await harness(baseURL), context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    await h.reset({ scoreDisplay: 'boxes', overlayLayout: 'side' });
    const page = await context.newPage(); await page.goto('/overlay/draft#token=e2e-overlay');
    await expect(page.locator('.broadcast-side')).toBeVisible(); await expect(page.locator('.draft-history')).toHaveCount(0);
    for (const [seriesFormat, count] of [['BO1', 1], ['BO3', 2], ['BO5', 3], ['BO7', 4]] as const) {
      await h.send({ type: 'settings', settings: { ...h.state(), seriesFormat } });
      await expect(page.locator('.blue-score .score-box')).toHaveCount(count);
    }
    await h.send({ type: 'score', team: 'blue', delta: 1 }); await expect(page.locator('.blue-score .lit')).toHaveCount(1);
    await h.send({ type: 'swap_sides' }); await expect(page.locator('.red-score .lit')).toHaveCount(1);
    const control = await context.newPage(); await control.goto('/control#token=e2e-control');
    await control.getByRole('button', { name: 'Match settings', exact: true }).click();
    await expect(control.locator('.control-monitor .settings-inline')).toBeVisible();
    await h.fill(); await expect(page.locator('.hero-art')).toHaveCount(10);
    await expect(page.locator('.ban.hero-slot')).toHaveCount(10);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  } finally { h.close(); await context.close(); }
});

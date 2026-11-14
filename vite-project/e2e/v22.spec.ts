import { test, expect } from '@playwright/test';
import { harness } from './harness';
import { initialState } from '../src/shared/types';

for (const overlayLayout of ['panel', 'side'] as const) {
  test(`${overlayLayout}: ten assigned player cards fit the transparent 1920x1080 canvas and use P1-P5 seats`, async ({ page, baseURL }) => {
    const h = await harness(baseURL);
    try {
      await h.reset({ overlayLayout, artSourceMode: 'legacy' }); await h.fill();
      await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/overlay/draft#token=e2e-overlay');
      await expect(page.locator(`.broadcast-${overlayLayout}`)).toBeVisible();
      await expect(page.locator('.hero-art')).toHaveCount(10);
      await expect(page.locator('.position-bar').first()).toHaveText('P1');
      for (const card of await page.locator('.broadcast-card').all()) {
        const rect = (await card.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1920); expect(rect.y + rect.height).toBeLessThanOrEqual(1080);
      }
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    } finally { h.close(); }
  });
}

test('hidden champion names promote and auto-fit long player IDs', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    const defaults = initialState();
    await h.reset({ showHeroName: false, artSourceMode: 'legacy', blueTeam: { ...defaults.blueTeam, players: Array.from({ length: 5 }, (_, i) => `VeryLongTournamentPlayerName${i}`) }, redTeam: { ...defaults.redTeam, players: Array.from({ length: 5 }, (_, i) => `LongOpponentPlayerIdentity${i}`) } });
    await h.fill(); await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/overlay/draft#token=e2e-overlay');
    await expect(page.locator('.card-caption strong,.ban-name')).toHaveCount(0); await expect(page.locator('.player-id-only')).toHaveCount(10);
    const measurements = await page.locator('.player-id-only').evaluateAll(elements => elements.map(element => ({ width: element.scrollWidth, available: element.parentElement!.clientWidth, font: parseFloat(getComputedStyle(element).fontSize) })));
    expect(measurements.every(item => item.width <= item.available && item.font >= 6 && item.font <= 28)).toBe(true);
  } finally { h.close(); }
});

test('Champion Studio edits aliases without changing Riot IDs and fits a laptop viewport', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.reset(); await page.setViewportSize({ width: 1366, height: 768 }); await page.goto('/control#token=e2e-control');
    await page.getByRole('button', { name: 'Champion Studio', exact: true }).click();
    const dialog = page.locator('.hero-art-editor-dialog'); await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(1366); expect(box.y + box.height).toBeLessThanOrEqual(768);
    await dialog.getByLabel('Search champions', { exact: true }).fill('Annie');
    await dialog.getByRole('listitem').first().click();
    await dialog.getByText('Advanced data & assets', { exact: true }).click();
    await dialog.getByLabel('Search aliases', { exact: true }).fill('Studio Test Alias');
    await dialog.getByRole('button', { name: 'Save hero data', exact: true }).click();
    await expect.poll(() => h.state().heroDataOverrides['1']?.aliases).toEqual(['Studio Test Alias']);
    await dialog.getByRole('button', { name: 'Close Champion Studio', exact: true }).click();
    await page.getByLabel('Search heroes', { exact: true }).fill('Studio Test Alias');
    await expect(page.locator('.hero-grid button')).toHaveCount(1);
    await h.send({ type: 'reset_hero_data_override', heroId: 1 });
  } finally { h.close(); }
});

test('skipping a Ban and Undo preserve a distinct slot status', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.reset(); await page.goto('/control#token=e2e-control');
    const overlay = await page.context().newPage(); await overlay.goto('/overlay/draft#token=e2e-overlay');
    await page.getByRole('button', { name: 'Skip Ban step', exact: true }).click();
    await expect.poll(() => h.state().currentPhase).toBe(1);
    await expect(overlay.locator('.ban-team.blue [data-slot-status="skipped"]')).toHaveCount(1);
    expect(h.state().draftSlots['step-0-slot-0'].status).toBe('skipped');
    await h.send({ type: 'undo' });
    await expect(overlay.locator('.ban-team.blue [data-slot-status="skipped"]')).toHaveCount(0);
    expect(h.state().draftSlots['step-0-slot-0'].status).toBe('empty'); await overlay.close();
  } finally { h.close(); }
});

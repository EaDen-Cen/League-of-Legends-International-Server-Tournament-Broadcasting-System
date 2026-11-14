import { test, expect } from '@playwright/test';
import { harness } from './harness';
import heroes from '../src/components/HeroList';

test('all bundled champion portraits load, and English / custom aliases search the same stable Riot ID', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.reset();
    await h.send({ type: 'hero_data_override', heroId: heroes[0].id, override: { aliases: ['Hextech Alias'] } });
    await page.goto('/control#token=e2e-control');
    await expect(page.locator('.status')).toHaveText('Connected');
    await expect(page.locator('.hero-grid button')).toHaveCount(heroes.length);
    await expect.poll(() => page.locator('.hero-grid img').evaluateAll(images => images.filter(image => (image as HTMLImageElement).naturalWidth > 0).length)).toBe(heroes.length);
    await page.getByLabel('Search heroes', { exact: true }).fill('Hextech Alias');
    await expect(page.locator('.hero-grid button')).toHaveCount(1);
    await expect(page.locator('.hero-grid img')).toHaveAttribute('src', heroes[0].imageLink);
    await page.getByLabel('Search heroes', { exact: true }).fill('Aphelios');
    await expect(page.locator('.hero-grid button')).toHaveCount(1);
    await h.send({ type: 'reset_hero_data_override', heroId: heroes[0].id });
  } finally { h.close(); }
});

test('manual BP continues without game APIs and obsolete caster / recognition endpoints are unavailable', async ({ page, request, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.reset();
    for (const path of ['/api/capture', '/api/capture-lineup', '/api/recognize']) expect([404, 405]).toContain((await request.post(path, { headers: { Authorization: 'Bearer e2e-control' }, data: {} })).status());
    expect((await request.get('/api/match', { headers: { Authorization: 'Bearer e2e-caster' } })).status()).toBe(401);
    await page.goto('/control#token=e2e-control');
    const first = heroes[0];
    await page.getByLabel('Search heroes', { exact: true }).fill(first.englishName);
    await page.getByRole('button', { name: first.englishName, exact: true }).click();
    expect(h.state().currentPhase).toBe(0);
    await page.getByRole('button', { name: 'Confirm Ban', exact: true }).click();
    await expect.poll(() => h.state().currentPhase).toBe(1);
    await page.reload(); await expect(page.locator('.status')).toHaveText('Connected');
    await expect(page.locator('.compact-board [data-slot-status="selected"]')).toHaveCount(1);
    await expect(page.locator('.screen-input,.lcu-input')).toHaveCount(0);
  } finally { h.close(); }
});

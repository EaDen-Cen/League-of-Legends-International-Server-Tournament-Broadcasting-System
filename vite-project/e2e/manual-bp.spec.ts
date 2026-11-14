import { test, expect } from '@playwright/test';
import { harness } from './harness';
import heroes from '../src/components/HeroList';
import { legacyGameRules } from '../src/shared/gameRules';

test('mobile captain previews privately, confirms grouped picks, reconnects and loses access after rotation', async ({ browser, request, baseURL }) => {
  const h = await harness(baseURL);
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
    browser.newContext({ viewport: { width: 1200, height: 900 } }),
    browser.newContext({ viewport: { width: 1920, height: 1080 } }),
  ]);
  try {
    await h.send({ type: 'reset_match' });
    await h.send({ type: 'settings', settings: { ...h.state(), language: 'zh' } });
    await h.send({ type: 'settings', settings: { ...h.state(), language: 'zh',
      blueTeam: { ...h.state().blueTeam, name: 'Alpha', players: ['A1', 'A2', 'A3', 'A4', 'A5'] },
      redTeam: { ...h.state().redTeam, name: 'Beta', players: ['B1', 'B2', 'B3', 'B4', 'B5'] },
    } });
    await h.send({ type: 'current_rules', rules: { ...legacyGameRules(h.state()), stages: [
      { team: 'blue', action: 'pick', count: 1 }, { team: 'red', action: 'pick', count: 2 },
      { team: 'blue', action: 'pick', count: 2 }, { team: 'red', action: 'pick', count: 2 },
      { team: 'blue', action: 'pick', count: 2 }, { team: 'red', action: 'pick', count: 1 },
    ] } });
    await h.send({ type: 'pause_draft', paused: false });
    const grant = async (teamId: string, operation: string) => {
      const response = await request.post('/api/captains', { headers: { Authorization: 'Bearer e2e-control' }, data: { matchId: h.state().matchId, teamId, operation } });
      expect(response.ok()).toBeTruthy(); return response.json();
    };
    const aToken = (await grant(h.state().blueTeam.id, 'rotate')).token;
    const bToken = (await grant(h.state().redTeam.id, 'rotate')).token;
    const [control, a, b, overlay] = await Promise.all(contexts.map(context => context.newPage()));
    const errors: string[] = [];
    for (const page of [control, a, b, overlay]) {
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/cdn/img/champion/splash/**', route => route.abort());
    }
    await Promise.all([
      control.goto('/control#token=e2e-control'), a.goto(`/captain#token=${aToken}`),
      b.goto(`/captain#token=${bToken}`), overlay.goto('/overlay/draft#token=e2e-overlay'),
    ]);
    await expect(a.getByText('等待导播授权', { exact: true }).first()).toBeVisible();
    await grant(h.state().blueTeam.id, 'enable'); await grant(h.state().redTeam.id, 'enable');
    await expect(a.locator('.hero-grid button').first()).toBeEnabled();
    await expect(b.getByRole('button', { name: '确认选择', exact: true })).toBeDisabled();
    await a.getByRole('button', { name: heroes[0].chineseName, exact: true }).click();
    await expect(a.locator('.draft-confirmation')).toContainText(heroes[0].chineseName);
    expect(h.state().bluePicks).toEqual([]);
    await expect(overlay.locator('.broadcast-card.filled')).toHaveCount(0);
    await expect(b.locator('.draft-confirmation')).not.toContainText(heroes[0].chineseName);
    await a.getByRole('button', { name: '确认选择', exact: true }).click();
    await expect.poll(() => h.state().bluePicks).toEqual([heroes[0].id]);
    await expect(overlay.locator(`.pick-team.blue [data-hero-id="${heroes[0].id}"]`)).toBeVisible();
    await expect(overlay.locator('.broadcast-bans .hero-slot')).toHaveCount(0);
    await b.getByRole('button', { name: heroes[1].chineseName, exact: true }).click();
    await expect(b.getByRole('button', { name: '确认选择', exact: true })).toBeDisabled();
    await b.getByRole('button', { name: heroes[2].chineseName, exact: true }).click();
    await b.getByRole('button', { name: '确认选择', exact: true }).click();
    await expect.poll(() => h.state().redPicks).toEqual([heroes[1].id, heroes[2].id]);
    await a.reload();
    await expect(a.locator('.status.live')).toBeVisible();
    await expect(a.locator('.board .blue .picks img')).toHaveCount(1);
    await expect(a.locator('.draft-confirmation')).not.toContainText(heroes[0].chineseName);
    const overflow = await a.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect.poll(() => a.locator('.hero-grid img').evaluateAll(images => images.filter(image => (image as HTMLImageElement).naturalWidth > 0).length)).toBe(heroes.length);
    await a.screenshot({ path: 'artifacts/manual-captain-mobile.png', fullPage: true });
    await control.locator('.draft-correction summary').click();
    await control.getByLabel('Correction slot').selectOption('step-0-slot-0');
    await control.getByLabel('Correction champion').selectOption(String(heroes[30].id));
    await control.getByLabel('Correction reason').fill('Browser correction test');
    await control.getByRole('button', { name: '应用槽位更正', exact: true }).click();
    await expect.poll(() => h.state().bluePicks[0]).toBe(heroes[30].id);
    await expect(a.getByText('导播已接管本队', { exact: true }).first()).toBeVisible();
    await expect(overlay.locator(`.pick-team.blue [data-hero-id="${heroes[30].id}"]`)).toBeVisible();
    await grant(h.state().blueTeam.id, 'rotate');
    await expect(a.getByRole('heading', { name: '队长链接缺失或已失效' })).toBeVisible();
    await control.screenshot({ path: 'artifacts/manual-director.png', fullPage: true });
    await overlay.screenshot({ path: 'artifacts/manual-obs.png', omitBackground: true });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); h.close(); }
});

test('manual statistics freeze independently and read-only GHUD loads with the overlay credential', async ({ browser, request, baseURL }) => {
  const h = await harness(baseURL);
  const context = await browser.newContext();
  try {
    await h.send({ type: 'reset_match' });
    await h.send({ type: 'settings', settings: { ...h.state(), language: 'zh' } });
    const page = await context.newPage();
    await page.goto('/control#token=e2e-control');
    const panel = page.locator('.telemetry-panel');
    const form = panel.locator('.telemetry-manual-form');
    await form.getByRole('combobox').first().selectOption('kills');
    await expect.poll(async () => form.getByRole('combobox').nth(1).locator('option').count()).toBe(11);
    await form.getByRole('combobox').nth(1).selectOption({ index: 1 });
    await form.getByRole('spinbutton').fill('8');
    const revision = (await (await request.get('/api/match', { headers: { Authorization: 'Bearer e2e-control' } })).json()).revision;
    await panel.getByRole('button', { name: '保存并冻结本字段', exact: true }).click();
    await expect(panel.locator('tbody tr').first()).toContainText('8');
    await expect(panel.locator('tbody tr').first()).toContainText('FROZEN');
    expect((await (await request.get('/api/match', { headers: { Authorization: 'Bearer e2e-control' } })).json()).revision).toBe(revision);
    const overlay = await context.newPage();
    await overlay.goto('/overlay/ghud#token=e2e-overlay');
    await expect(overlay.locator('body')).toContainText('8');
    expect((await request.post('/api/telemetry/manual', { headers: { Authorization: 'Bearer e2e-overlay' }, data: { gameId: h.state().gameId, field: 'gameTime', value: 999 } })).status()).toBe(403);
    await page.screenshot({ path: 'artifacts/manual-telemetry.png', fullPage: true });
  } finally { await context.close(); h.close(); }
});

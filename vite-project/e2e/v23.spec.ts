import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { harness } from './harness';
import heroes from '../src/components/HeroList';
import { draftPhases } from '../src/shared/gameRules';

test('private preselection and IME/repeated Enter cannot submit without explicit confirmation', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.reset(); await page.goto('/control#token=e2e-control'); await expect(page.locator('.status')).toHaveText('Connected');
    const search = page.getByLabel('Search heroes', { exact: true }); await search.fill(heroes[0].englishName);
    await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true }); await search.press('Enter');
    expect(h.state().currentPhase).toBe(0);
    await page.locator('.hero-grid button').click(); expect(h.state().currentPhase).toBe(0);
    await page.getByRole('button', { name: 'Confirm Ban', exact: true }).click();
    await expect.poll(() => h.state().currentPhase).toBe(1); expect(h.state().blueBans).toEqual([heroes[0].id]);
  } finally { h.close(); }
});

test('genuine PNG/JPEG/WebP portraits upload, preview, reveal, undo and remain available after clearing', async ({ page, request, baseURL }) => {
  const h = await harness(baseURL);
  const overlay = await page.context().newPage();
  try {
    await h.reset({ artSourceMode: 'legacy' });
    await page.goto('/control#token=e2e-control'); await overlay.goto('/overlay/draft#token=e2e-overlay');
    await page.getByRole('button', { name: 'Team settings', exact: true }).click();
    const input = page.getByLabel('Player portrait URL', { exact: true }).first();
    await input.fill('/playerImg/missing.png'); await expect(page.locator('.portrait-status').first()).toContainText('failed');
    await page.getByLabel('Choose image', { exact: true }).first().setInputFiles('e2e/fixtures/player-test.png');
    await expect(input).toHaveValue(/^\/uploads\/player-portraits\/[0-9a-f-]+\.png$/);
    const url = await input.inputValue(); await expect(page.locator('.portrait-status').first()).toHaveText('Portrait loaded');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(overlay.locator('.pick-team.blue .player-portrait').first()).toHaveAttribute('src', url);
    expect((await request.get(url)).status()).toBe(200);
    const png = readFileSync('e2e/fixtures/player-test.png').toString('base64');
    for (const [mime, extension] of [['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
      const data = await page.evaluate(async ({ png, mime }) => { const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d')!.drawImage(image, 0, 0); return canvas.toDataURL(mime).split(',')[1]; }, { png, mime });
      const response = await request.post('/api/uploads/player-portrait', { headers: { Authorization: 'Bearer e2e-control', 'Content-Type': mime, 'X-File-Name': 'portrait.' + extension }, data: Buffer.from(data, 'base64') });
      expect(response.status()).toBe(201); expect((await request.get((await response.json()).url)).status()).toBe(200);
    }
    await page.getByRole('button', { name: 'Close team settings', exact: true }).click();
    while (draftPhases(h.state())[h.state().currentPhase].action === 'ban') { const phase = draftPhases(h.state())[h.state().currentPhase]; await h.send({ type: 'skip_ban', team: phase.team }); }
    const phase = draftPhases(h.state())[h.state().currentPhase];
    await h.send({ type: 'draft_group', team: phase.team, action: 'pick', heroIds: [heroes[0].id] });
    await expect(overlay.locator('.pick-team.blue .hero-art')).toHaveCount(1);
    await h.send({ type: 'undo' }); await expect(overlay.locator('.pick-team.blue .player-portrait').first()).toHaveAttribute('src', url);
    await page.getByRole('button', { name: 'Team settings', exact: true }).click();
    await page.getByRole('button', { name: 'Clear image', exact: true }).first().click(); await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(overlay.locator('.player-portrait')).toHaveCount(0); expect((await request.get(url)).status()).toBe(200);
  } finally { h.close(); await overlay.close(); }
});

test('captain final confirmation has a separate permission and a director assignment correction cancels it', async ({ page, request, baseURL }) => {
  const h = await harness(baseURL), headers = { Authorization: 'Bearer e2e-control' };
  try {
    await h.reset(); await h.fill();
    const teamId = h.state().blueTeam.id;
    const data = { matchId: h.state().matchId, teamId };
    const invite = await request.post('/api/captains', { headers, data: { ...data, operation: 'rotate' } });
    const token = (await invite.json()).token;
    await request.post('/api/captains', { headers, data: { ...data, operation: 'enable' } });
    await page.goto(`/captain#token=${token}`); await expect(page.locator('.status')).toHaveText('Connected');
    const confirmation = page.getByRole('button', { name: 'Confirm final lineup', exact: true });
    await expect(confirmation).toBeDisabled();
    await request.post('/api/captains', { headers, data: { ...data, operation: 'confirmation', enabled: true } });
    await expect(confirmation).toBeEnabled(); await confirmation.click();
    await expect.poll(() => h.state().lineupConfirmedTeamIds).toContain(teamId);
    const originalPicks = [...h.state().bluePicks];
    await h.send({ type: 'swap_assignments', team: 'blue', from: 0, to: 1 });
    expect(h.state().lineupConfirmedTeamIds).not.toContain(teamId);
    expect(h.state().bluePicks).toEqual(originalPicks);
    await expect(confirmation).toBeDisabled();
  } finally { h.close(); }
});

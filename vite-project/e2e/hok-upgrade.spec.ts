import { test, expect } from '@playwright/test';
import { harness } from './harness';

test('BO7, per-game rules and roster preflight work through the control UI', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.send({ type: 'settings', settings: { ...h.state(), language: 'eng', seriesFormat: 'BO7', scoreDisplay: 'boxes',
      blueTeam: { ...h.state().blueTeam, players: ['A1', 'A2', 'A3', 'A4', 'A5'] },
      redTeam: { ...h.state().redTeam, players: ['B1', 'B2', 'B3', 'B4', 'B5'] } } });
    await page.goto('/control#token=e2e-control');
    await expect(page.locator('.status.live')).toBeVisible();
    await page.locator('.preflight-status summary').click();
    const confirmation = page.getByRole('checkbox', { name: /I verified/ });
    await confirmation.check();
    await expect(confirmation).toBeChecked();
    await h.send({ type: 'skip_ban', team: 'blue' });
    await expect(confirmation).toBeChecked();
    await page.locator('.game-rules-manager summary').click();
    await page.getByLabel('Edit scope').selectOption('2');
    await page.getByLabel('Draft sequence').selectOption('normal');
    await page.getByLabel('First pick').selectOption('red');
    await page.getByRole('button', { name: 'Save game rules' }).click();
    await expect.poll(() => h.state().seriesRules?.games['2']?.firstPickSide).toBe('red');
    await page.locator('.game-rules-manager summary').click();
    await page.getByLabel('Edit scope').selectOption('1');
    await expect(page.getByLabel('Draft sequence')).toBeDisabled();
    await h.fill();
    await h.send({ type: 'commit_game' });
    await h.send({ type: 'score', team: 'blue', delta: 1 });
    await h.send({ type: 'next_game' });
    await expect(confirmation).not.toBeChecked();
    await expect.poll(() => h.state().firstPickSide).toBe('red');
    const overlay = await page.context().newPage();
    await overlay.goto('/overlay/draft#token=e2e-overlay');
    await expect(overlay.locator('.blue-score .score-box')).toHaveCount(4);
    await expect(overlay.locator('.red-score .score-box')).toHaveCount(4);
    await page.screenshot({ path: 'artifacts/lol-hok-upgrade-control.png', fullPage: true });
  } finally { await h.send({ type: 'reset_match' }); await h.send({ type: 'clear_series_rules' }); h.close(); }
});

test('late artwork cannot overwrite a newer pick or undo', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.send({ type: 'reset_match' });
    // Keep all artwork requests pending to exercise cancellation while decoding.
    await page.route('**/cdn/img/champion/splash/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 700));
      await route.abort();
    });
    await page.goto('/overlay/draft#token=e2e-overlay');
    const { phases } = await import('../src/shared/types');
    const { default: heroes } = await import('../src/components/HeroList');
    for (let i = 0; i < 6; i++) await h.send({ type: 'skip_ban', team: phases(h.state().draftMode, h.state().firstPickSide)[i].team });
    const phase = phases(h.state().draftMode, h.state().firstPickSide)[6];
    await h.send({ type: 'draft_action', ...phase, heroId: heroes[0].id });
    await h.send({ type: 'undo' });
    await h.send({ type: 'draft_action', ...phase, heroId: heroes[1].id });
    const reveal = page.locator(`.pick-team.${phase.team} .hero-reveal`).first();
    await expect(reveal).toHaveAttribute('data-showing-hero', String(heroes[1].id));
    await expect(reveal).toHaveClass('hero-reveal');
    await page.waitForTimeout(800);
    await expect(reveal).toHaveAttribute('data-showing-hero', String(heroes[1].id));
  } finally { await h.send({ type: 'reset_match' }); await h.send({ type: 'clear_series_rules' }); h.close(); }
});

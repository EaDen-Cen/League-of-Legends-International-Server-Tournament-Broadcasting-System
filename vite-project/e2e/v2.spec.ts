import { test, expect } from '@playwright/test';
import { harness } from './harness';
import heroes from '../src/components/HeroList';
import { initialState } from '../src/shared/types';

for (const mode of ['normal', 'player', 'global'] as const) {
  test(`${mode}: archived assignments, series scores and history follow stable team identity after side swaps`, async ({ page, baseURL }) => {
    const h = await harness(baseURL);
    try {
      const defaults = initialState();
      await h.reset({ draftRuleMode: mode, seriesFormat: 'BO5', blueTeam: { ...defaults.blueTeam, name: 'NORTHWIND', players: ['Orion', 'Kite', 'Nova', 'Echo', 'River'] }, redTeam: { ...defaults.redTeam, name: 'CRIMSON FIVE', players: ['Atlas', 'Flare', 'Vex', 'Sage', 'Luna'] } });
      await page.goto('/overlay/draft#token=e2e-overlay');
      await h.fill(); const first = structuredClone(h.state());
      await expect(page.locator('.hero-art')).toHaveCount(10);
      await h.send({ type: 'commit_game' }); await expect(page.locator('.history-game')).toHaveCount(1);
      await h.send({ type: 'score', team: 'blue', delta: 1 }); await h.send({ type: 'next_game' }); await h.send({ type: 'swap_sides' });
      await expect(page.locator('.broadcast-team.blue h2')).toHaveText('CRIMSON FIVE');
      await expect(page.locator('.red-score')).toHaveText('1');
      expect(h.state().redTeam.id).toBe(first.blueTeam.id);
      await expect(page.locator('.history-game .history-team.red img').first()).toHaveAttribute('src', heroes.find(hero => hero.id === first.blueAssignments[0])!.imageLink);
      await h.fill(); await h.send({ type: 'commit_game' }); await page.reload();
      await expect(page.locator('.history-game')).toHaveCount(2);
      expect(h.state().draftHistory[0].bluePicks).toEqual(first.bluePicks);
    } finally { h.close(); }
  });
}

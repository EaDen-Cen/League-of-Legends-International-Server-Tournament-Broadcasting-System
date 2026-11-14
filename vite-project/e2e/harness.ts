import { expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import heroes from '../src/components/HeroList';
import { draftRestriction } from '../src/shared/draftRules';
import { draftPhases } from '../src/shared/gameRules';
import { initialState, type Action, type MatchSettings, type Snapshot } from '../src/shared/types';

export async function harness(baseURL: string | undefined) {
  expect(baseURL).toBe('http://127.0.0.1:3101');
  const ws = new WebSocket('ws://127.0.0.1:3101/ws');
  let snapshot: Snapshot;
  const waiting = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  await new Promise<void>((resolve, reject) => {
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'e2e-control' })));
    ws.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'match_state_update') { snapshot = message; resolve(); }
      const pending = waiting.get(message.id);
      if (pending && message.type === 'ack') { waiting.delete(message.id); pending.resolve(); }
      if (pending && message.type === 'error') { waiting.delete(message.id); pending.reject(new Error(message.error)); }
    });
  });
  const send = async (action: Action) => {
    await new Promise<void>((resolve, reject) => {
      const id = randomUUID(), timer = setTimeout(() => { waiting.delete(id); reject(new Error('Action timed out')); }, 10000);
      waiting.set(id, { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
      ws.send(JSON.stringify({ type: 'action', id, revision: snapshot.revision, action, matchId: snapshot.state.matchId, gameId: snapshot.state.gameId, stepId: draftPhases(snapshot.state)[snapshot.state.currentPhase]?.stepId ?? 'complete' }));
    });
  };
  const fill = async () => {
    while (!snapshot.state.draftComplete) {
      const state = snapshot.state, phase = draftPhases(state)[state.currentPhase];
      const used = [...state.blueBans, ...state.redBans, ...state.bluePicks, ...state.redPicks];
      const heroIds: number[] = [];
      for (let slot = 0; slot < phase.count; slot++) {
        const hero = heroes.find(hero => !used.includes(hero.id) && !heroIds.includes(hero.id)
          && (!state.currentGameRules?.heroPool || state.currentGameRules.heroPool.includes(hero.id)) && !draftRestriction(state, phase.team, phase.action, hero.id));
        if (!hero) throw Error('No legal test champion');
        heroIds.push(hero.id);
      }
      await send({ type: 'draft_group', team: phase.team, action: phase.action, heroIds });
    }
  };
  const reset = async (settings: Partial<MatchSettings> = {}) => {
    await send({ type: 'reset_match' }); await send({ type: 'clear_series_rules' });
    await send({ type: 'settings', settings: { ...initialState(), language: 'eng', ...settings } });
  };
  return { send, fill, reset, state: () => snapshot.state, close: () => ws.close() };
}

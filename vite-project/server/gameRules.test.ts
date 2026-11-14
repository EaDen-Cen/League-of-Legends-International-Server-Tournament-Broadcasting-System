import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import { phases, type Action, type SeriesRules } from '../src/shared/types.js';
import { gameRulesFor, legacyGameRules } from '../src/shared/gameRules.js';
import { draftHeroUsed, draftRestriction, pickRestriction } from '../src/shared/draftRules.js';
import heroes from '../src/components/HeroList.js';
const act = (store: Store, action: Action) => store.apply(randomUUID(), store.data.revision, action);
const plan = (store: Store): SeriesRules => ({ defaultGameRules: legacyGameRules(store.data.state), games: {} });
function fill(store: Store) {
  while (!store.data.state.draftComplete) {
    const state = store.data.state;
    const phase = phases(state.draftMode, state.firstPickSide)[state.currentPhase];
    const hero = heroes.find(h => !draftHeroUsed(state, h.id) && !draftRestriction(state, phase.team, phase.action, h.id))!;
    act(store, { type: 'draft_action', ...phase, heroId: hero.id });
  }
}
function advance(store: Store) {
  act(store, { type: 'commit_game' });
  act(store, { type: 'score', team: 'blue', delta: 1 });
  act(store, { type: 'next_game' });
}
test('BO7 supports four wins, seven games and rejects a fifth win', () => {
  const store = new Store();
  act(store, { type: 'settings', settings: { ...store.data.state, seriesFormat: 'BO7', blueScore: 3, redScore: 3, gameNumber: 7 } });
  assert.equal(store.data.state.gameNumber, 7);
  act(store, { type: 'score', team: 'blue', delta: 1 });
  assert.equal(store.data.state.blueScore, 4);
  assert.throws(() => act(store, { type: 'score', team: 'blue', delta: 1 }));
  assert.throws(() => act(store, { type: 'score', team: 'red', delta: 1 }));
});
test('per-game sequence and first pick activate on next game; history snapshots stay immutable', () => {
  const store = new Store();
  const rules = plan(store);
  rules.games['2'] = { draftMode: 'normal', firstPickSide: 'red', draftRuleMode: 'global' };
  act(store, { type: 'series_rules', rules });
  fill(store); advance(store);
  assert.equal(store.data.state.draftMode, 'normal');
  assert.equal(store.data.state.firstPickSide, 'red');
  assert.equal(store.data.state.draftHistory[0].rules?.draftMode, 'match');
  assert.equal(pickRestriction(store.data.state, 'blue', 0, store.data.state.draftHistory[0].bluePicks[0]), 'usedByTeam');
  fill(store);
  assert.equal(store.data.state.redBans.length, 2);
});
test('started rules are locked while future rules remain editable and undoable', () => {
  const store = new Store();
  act(store, { type: 'series_rules', rules: plan(store) });
  act(store, { type: 'skip_ban', team: 'blue' });
  const rules = structuredClone(store.data.state.seriesRules!);
  rules.defaultGameRules.firstPickSide = 'red';
  assert.throws(() => act(store, { type: 'series_rules', rules }));
  rules.games['1'] = gameRulesFor(store.data.state, 1);
  act(store, { type: 'series_rules', rules });
  assert.equal(store.data.state.firstPickSide, 'blue');
  assert.equal(gameRulesFor(store.data.state, 2).firstPickSide, 'red');
  act(store, { type: 'undo' });
  assert.equal(gameRulesFor(store.data.state, 2).firstPickSide, 'blue');
});
test('history contribution and enforcement flags independently control fearless restrictions', () => {
  for (const contribute of [true, false]) {
    const store = new Store();
    const rules = plan(store);
    rules.defaultGameRules.draftRuleMode = 'global';
    rules.games['1'] = { contributeToFutureHistory: contribute };
    act(store, { type: 'series_rules', rules }); fill(store); advance(store);
    const id = store.data.state.draftHistory[0].bluePicks[0];
    assert.equal(pickRestriction(store.data.state, 'blue', 0, id), contribute ? 'usedByTeam' : undefined);
    const updated = structuredClone(store.data.state.seriesRules!);
    updated.games['2'] = { enforcePreviousHistory: false };
    act(store, { type: 'series_rules', rules: updated });
    assert.equal(pickRestriction(store.data.state, 'blue', 0, id), undefined);
  }
});
test('plans survive restart and reset while future rules activate only on next game', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lol-rules-'));
  try {
    const file = join(directory, 'match.json');
    let now = 1_000_000;
    const store = new Store(file, () => now);
    const rules = plan(store);
    rules.games['2'] = { draftMode: 'normal', firstPickSide: 'red' };
    act(store, { type: 'series_rules', rules }); fill(store);
    now += 200_000;
    advance(store);
    assert.equal(store.snapshot('overlay').state.draftMode, 'normal');
    const restarted = new Store(file);
    assert.deepEqual(restarted.data.state.seriesRules, rules);
    assert.equal(restarted.data.state.currentGameRules?.firstPickSide, 'red');
    act(restarted, { type: 'reset_match' });
    assert.deepEqual(restarted.data.state.seriesRules, rules);
    assert.equal(restarted.data.state.firstPickSide, 'blue');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('reject malformed rules, out-of-series games and settings that bypass the plan', () => {
  const store = new Store();
  const rules = plan(store);
  for (const key of ['0', '4', '__proto__', '1.5']) {
    assert.throws(() => act(store, { type: 'series_rules', rules: { ...rules, games: { [key]: { firstPickSide: 'red' } } } }));
  }
  assert.throws(() => act(store, { type: 'series_rules', rules: { ...rules, games: { '1': { firstPickSide: 'invalid' } } } as unknown as SeriesRules }));
  act(store, { type: 'series_rules', rules });
  assert.throws(() => act(store, { type: 'settings', settings: { ...store.data.state, draftMode: 'normal' } }));
});

test('disabling plans is explicit, locked during a match and undoable', () => {
  const store = new Store();
  const rules = plan(store);
  rules.defaultGameRules.firstPickSide = 'red';
  act(store, { type: 'series_rules', rules });
  act(store, { type: 'clear_series_rules' });
  assert.equal(store.data.state.seriesRules, undefined);
  assert.equal(store.data.state.firstPickSide, 'red');
  act(store, { type: 'undo' });
  assert.deepEqual(store.data.state.seriesRules, rules);
  act(store, { type: 'skip_ban', team: 'red' });
  assert.throws(() => act(store, { type: 'clear_series_rules' }), /rulesLocked/);
  act(store, { type: 'reset_match' });
  act(store, { type: 'clear_series_rules' });
  assert.equal(store.data.state.currentGameRules, undefined);
});

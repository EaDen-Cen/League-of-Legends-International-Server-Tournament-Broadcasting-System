import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import heroes from '../src/components/HeroList.js';
import { phases, type Action, type DraftRuleMode, type MatchState } from '../src/shared/types.js';
import { pickRestriction, banRestriction, draftHeroUsed, draftRestriction } from '../src/shared/draftRules.js';

const act = (s: Store, action: Action) => s.apply(randomUUID(), s.data.revision, action);
function setup(mode: DraftRuleMode, s = new Store()) {
  act(s, { type: 'settings', settings: { ...s.data.state, seriesFormat: 'BO5', draftRuleMode: mode,
    blueTeam: { ...s.data.state.blueTeam, players: ['A1', 'A2', 'A3', 'A4', 'A5'] },
    redTeam: { ...s.data.state.redTeam, players: ['B1', 'B2', 'B3', 'B4', 'B5'] },
  } });
  return s;
}
function fill(s: Store) {
  while (!s.data.state.draftComplete) {
    const st = s.data.state, phase = phases(st.draftMode)[st.currentPhase];
    const hero = heroes.find(h => !draftHeroUsed(st, h.id) && !draftRestriction(st, phase.team, phase.action, h.id))!;
    act(s, { type: 'draft_action', ...phase, heroId: hero.id });
  }
}
function advance(s: Store) {
  act(s, { type: 'commit_game' }); act(s, { type: 'score', team: 'blue', delta: 1 }); act(s, { type: 'next_game' });
}


test('Normal BP keeps committed history but all previous picks are reusable', () => {
  const s = setup('normal'); fill(s); const old = [...s.data.state.bluePicks, ...s.data.state.redPicks];
  advance(s);
  assert.equal(s.data.state.draftHistory.length, 1);
  for (const id of old) for (const side of ['blue', 'red'] as const) assert.equal(pickRestriction(s.data.state, side, 0, id), undefined);
  fill(s); assert.equal(s.data.state.draftComplete, true);
});
test('Global BP accumulates each team independently across two games and follows sides and rename', () => {
  const s = setup('global'); fill(s);
  const first = structuredClone(s.data.state); advance(s);
  for (const id of first.bluePicks) {
    assert.equal(pickRestriction(s.data.state, 'blue', 0, id), 'usedByTeam');
    assert.equal(pickRestriction(s.data.state, 'red', 0, id), undefined);
  }
  for (const id of first.redPicks) assert.equal(pickRestriction(s.data.state, 'blue', 0, id), undefined);
  fill(s); const second = structuredClone(s.data.state); advance(s);
  for (const id of [...first.bluePicks, ...second.bluePicks]) assert.equal(pickRestriction(s.data.state, 'blue', 4, id), 'usedByTeam');
  for (const id of [...first.redPicks, ...second.redPicks]) assert.equal(pickRestriction(s.data.state, 'red', 2, id), 'usedByTeam');
  act(s, { type: 'swap_sides' });
  act(s, { type: 'settings', settings: { ...s.data.state, redTeam: { ...s.data.state.redTeam, name: 'Renamed', players: ['New', 'A2', 'A3', 'A4', 'A5'] } } });
  assert.equal(s.data.state.redTeam.id, first.blueTeam.id);
  assert.equal(s.data.state.redScore, 2);
  assert.equal(pickRestriction(s.data.state, 'red', 0, first.bluePicks[0]), 'usedByTeam');
});
test('Player BP follows player identity across slots, substitutes and side changes; teammates can reuse', () => {
  const s = setup('player'); fill(s); const first = structuredClone(s.data.state); advance(s);
  assert.equal(pickRestriction(s.data.state, 'blue', 0, first.bluePicks[0]), 'usedByPlayer');
  assert.equal(pickRestriction(s.data.state, 'blue', 1, first.bluePicks[0]), undefined);
  assert.equal(pickRestriction(s.data.state, 'red', 0, first.bluePicks[0]), undefined);
  act(s, { type: 'settings', settings: { ...s.data.state, blueTeam: { ...s.data.state.blueTeam, players: ['Sub', ' a1 ', 'A3', 'A4', 'A5'] } } });
  assert.equal(pickRestriction(s.data.state, 'blue', 0, first.bluePicks[0]), undefined);
  assert.equal(pickRestriction(s.data.state, 'blue', 1, first.bluePicks[0]), 'usedByPlayer');
  act(s, { type: 'swap_sides' });
  assert.equal(pickRestriction(s.data.state, 'red', 1, first.bluePicks[0]), 'usedByPlayer');
  assert.throws(() => act(s, { type: 'settings', settings: { ...s.data.state, redTeam: { ...s.data.state.redTeam, players: ['A1', ' a1 ', 'A3', 'A4', 'A5'] } } }), /duplicatePlayerIds/);
});
test('Global BP rejects team-history picks, while own history does not forbid bans', () => {
  const s = setup('global'); fill(s); const previous = s.data.state.bluePicks[0]; advance(s);
  for (let i = 0; i < 6; i++) act(s, { type: 'draft_action', ...phases('match')[i], heroId: heroes[70 + i].id });
  assert.throws(() => act(s, { type: 'draft_action', team: 'blue', action: 'pick', heroId: previous }), /usedByTeam/);
  act(s, { type: 'reset_draft' });
  act(s, { type: 'draft_action', team: 'blue', action: 'ban', heroId: previous });
  assert.equal(s.data.state.blueBans[0], previous);
});
test('Player BP allows help-picks but validates the final owner before commit', () => {
  const s = setup('player'); fill(s); const previous = s.data.state.blueAssignments[0] as number; advance(s);
  for (let i = 0; i < 6; i++) act(s, { type: 'draft_action', ...phases('match')[i], heroId: heroes[70 + i].id });
  // A teammate may secure A1's old hero during the draft; draft order is not ownership.
  act(s, { type: 'draft_action', team: 'blue', action: 'pick', heroId: previous });
  fill(s);
  assert.throws(() => act(s, { type: 'commit_game' }), /usedByPlayer/);
  act(s, { type: 'swap_assignments', team: 'blue', from: 0, to: 1 });
  act(s, { type: 'commit_game' });
  assert.equal(s.data.state.draftHistory.at(-1)?.blueAssignments[1], previous);
});
test('commit is explicit, durable and idempotent; redo/reset does not create or delete history', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'lol-v2-')), 'match.json');
  const s = setup('global', new Store(file));
  assert.throws(() => act(s, { type: 'commit_game' }), /completeDraftFirst/);
  fill(s); assert.equal(s.data.state.draftHistory.length, 0);
  act(s, { type: 'reset_draft' }); assert.equal(s.data.state.draftHistory.length, 0); fill(s);
  const id = randomUUID(), rev = s.data.revision;
  s.apply(id, rev, { type: 'commit_game' }); s.apply(id, rev, { type: 'commit_game' });
  assert.throws(() => act(s, { type: 'commit_game' }), /gameAlreadyCommitted/);
  assert.throws(() => act(s, { type: 'next_game' }), /updateScoreBeforeNext/);
  assert.throws(() => act(s, { type: 'reset_draft' }), /committedDraftReset/);
  assert.deepEqual(new Store(file).data, s.data);
  act(s, { type: 'score', team: 'blue', delta: 1 }); act(s, { type: 'next_game' });
  fill(s); act(s, { type: 'reset_draft' }); assert.equal(s.data.state.draftHistory.length, 1);
  act(s, { type: 'reset_match' }); assert.equal(s.data.state.draftHistory.length, 0);
  act(s, { type: 'undo' }); assert.equal(s.data.state.draftHistory.length, 1);
});
test('rules lock after draft starts and after history; mid-draft side edits are rejected while roster edits remain available', () => {
  const s = setup('normal');
  for (const draftRuleMode of ['player', 'global', 'normal'] as const) act(s, { type: 'settings', settings: { ...s.data.state, draftRuleMode } });
  fill(s);
  assert.throws(() => act(s, { type: 'settings', settings: { ...s.data.state, draftRuleMode: 'global' } }), /rulesLocked/);
  assert.throws(() => act(s, { type: 'swap_sides' }), /swapOnlyBetweenGames/);
  act(s, { type: 'settings', settings: { ...s.data.state, blueTeam: { ...s.data.state.blueTeam, players: ['Sub', 'A2', 'A3', 'A4', 'A5'] } } });
  assert.equal(s.data.state.blueTeam.players[0], 'Sub');
  advance(s); assert.throws(() => act(s, { type: 'settings', settings: { ...s.data.state, draftRuleMode: 'global' } }), /rulesLocked/);
});
test('score actions publish immediately without renumbering the completed draft; commit and undo are delayed', () => {
  let now = 1000000; const s = setup('global', new Store(undefined, () => now)); fill(s);
  now += 180000;
  act(s, { type: 'score', team: 'blue', delta: 1 });
  assert.equal(s.data.state.gameNumber, 2); assert.equal(s.data.state.draftGameNumber, 1);
  assert.equal(s.snapshot('caster').state.blueScore, 0);
  act(s, { type: 'commit_game' }); assert.equal(s.data.state.draftHistory[0].gameNumber, 1);
  assert.equal(s.snapshot('caster').state.draftHistory.length, 0);
  now += 180000; assert.equal(s.snapshot('caster').state.draftHistory.length, 1);
  act(s, { type: 'undo' }); assert.equal(s.data.state.draftHistory.length, 0);
  assert.equal(s.snapshot('caster').state.draftHistory.length, 1);
  now += 180000; assert.equal(s.snapshot('caster').state.draftHistory.length, 0);
  const before = structuredClone(s.data);
  assert.throws(() => act(s, { type: 'score', team: 'red', delta: -1 })); assert.deepEqual(s.data, before);
});
test('legacy migration covers active state, old delayed snapshots and undo records without discarding data', () => {
  const s = new Store(); fill(s);
  const legacy = JSON.parse(JSON.stringify(s.data));
  for (const st of [legacy.state, ...legacy.history, ...legacy.events.map((e: {resultingState: MatchState}) => e.resultingState)]) {
    for (const key of ['draftRuleMode', 'draftHistory', 'draftGameNumber', 'committedGameId', 'blueAssignments', 'redAssignments']) delete st[key];
    for (const side of ['blue', 'red']) { delete st[`${side}Team`].playerRoles; delete st[`${side}Team`].players; delete st[`${side}Team`].id; }
  }
  const file = join(mkdtempSync(join(tmpdir(), 'lol-legacy-')), 'match.json'); writeFileSync(file, JSON.stringify(legacy));
  const restored = new Store(file, () => Date.now() + 3600000);
  for (const st of [restored.data.state, restored.snapshot('caster').state, ...restored.data.history]) {
    assert.equal(st.draftRuleMode, 'normal'); assert.deepEqual(st.draftHistory, []);
    assert.equal(st.blueTeam.playerRoles.length, 5); assert.equal(st.redTeam.players.length, 5);
  }
  assert.deepEqual(restored.data.state.bluePicks, s.data.state.bluePicks);
  assert.deepEqual(restored.data.state.blueAssignments, [...s.data.state.bluePicks, ...Array(5 - s.data.state.bluePicks.length).fill(null)]);
  act(restored, { type: 'undo' }); assert.equal(restored.data.state.currentPhase, 19);
});
test('player assignment changes preserve immutable pick order and cannot bypass personal restrictions', () => {
  const s = setup('player'); fill(s); const original = [...s.data.state.bluePicks];
  act(s, { type: 'swap_assignments', team: 'blue', from: 0, to: 1 });
  assert.deepEqual(s.data.state.bluePicks, original);
  assert.equal(s.data.state.blueAssignments[0], original[1]);
  assert.equal(s.data.state.blueAssignments[1], original[0]);
  advance(s);
  assert.equal(pickRestriction(s.data.state, 'blue', 0, original[1]), 'usedByPlayer');
  assert.equal(pickRestriction(s.data.state, 'blue', 1, original[0]), 'usedByPlayer');
  fill(s);
  const before = structuredClone(s.data.state);
  const assignments = s.data.state.blueAssignments as number[];
  let blocked = false;
  for (let i = 0; i < 5 && !blocked; i++) for (let j = i + 1; j < 5 && !blocked; j++) {
    if (pickRestriction(s.data.state, 'blue', i, assignments[j]) || pickRestriction(s.data.state, 'blue', j, assignments[i])) {
      assert.throws(() => act(s, { type: 'swap_assignments', team: 'blue', from: i, to: j }), /usedByPlayer/);
      blocked = true;
    }
  }
  assert.ok(blocked);
  assert.deepEqual(s.data.state, before);
});

test('a five-game series commits each game once and closes at the winning score', () => {
  const s = setup('global');
  for (let game = 1; game <= 5; game++) {
    fill(s); act(s, { type: 'commit_game' });
    act(s, { type: 'score', team: game % 2 ? 'blue' : 'red', delta: 1 });
    if (game < 5) act(s, { type: 'next_game' });
  }
  assert.deepEqual(s.data.state.draftHistory.map(g => g.gameNumber), [1, 2, 3, 4, 5]);
  assert.equal(s.data.state.gameNumber, 5); assert.equal(s.data.state.blueScore, 3); assert.equal(s.data.state.redScore, 2);
  assert.throws(() => act(s, { type: 'next_game' }), /seriesHasEnded/);
  assert.throws(() => act(s, { type: 'score', team: 'red', delta: 1 }));
});
test('Player BP requires all player IDs before the first ban and cannot silently use slot identity', () => {
  const s = new Store(); act(s, { type: 'settings', settings: { ...s.data.state, draftRuleMode: 'player' } });
  assert.throws(() => act(s, { type: 'draft_action', team: 'blue', action: 'ban', heroId: 1 }), /playerMissing/);
  assert.equal(s.data.state.currentPhase, 0);
});


test('live roster metadata reaches Caster immediately while draft/history remain authoritative and undoable', () => {
  let now = 1000000;
  const s = setup('global', new Store(undefined, () => now)); fill(s);
  now += 180000;
  const before = structuredClone(s.data.state);
  act(s, { type: 'settings', settings: { ...s.data.state, blueTeam: { ...s.data.state.blueTeam, players: ['Sub', 'A2', 'A3', 'A4', 'A5'], playerRoles: ['mid','jungle','top','bot','support'], playerPortraits: ['/playerImg/sub.png','','','',''] } } });
  assert.deepEqual(s.data.state.bluePicks, before.bluePicks);
  assert.equal(s.data.state.currentPhase, before.currentPhase);
  assert.equal(s.snapshot('overlay').state.blueTeam.players[0], 'Sub');
  assert.equal(s.snapshot('caster').state.blueTeam.players[0], 'Sub');
  now += 180000;
  assert.equal(s.snapshot('caster').state.blueTeam.players[0], 'Sub');
  act(s, { type: 'undo' }); assert.deepEqual(s.data.state, before);
  act(s, { type: 'commit_game' });
  const history = structuredClone(s.data.state.draftHistory);
  act(s, { type: 'settings', settings: { ...s.data.state, blueTeam: { ...s.data.state.blueTeam, players: ['Later', 'A2', 'A3', 'A4', 'A5'] } } });
  assert.equal(s.data.state.blueTeam.players[0], 'Later');
  assert.deepEqual(s.data.state.draftHistory, history);
});

test('live player ID changes revalidate selected heroes atomically against personal history', () => {
  const s = setup('player'); fill(s);
  const used = s.data.state.bluePicks[0]; advance(s);
  act(s, { type: 'settings', settings: { ...s.data.state, blueTeam: { ...s.data.state.blueTeam, players: ['Sub','A2','A3','A4','A5'] } } });
  for (let i=0;i<6;i++) act(s,{type:'draft_action',...phases('match')[i],heroId:heroes[80+i].id});
  act(s,{type:'draft_action',team:'blue',action:'pick',heroId:used});
  fill(s);
  const before = structuredClone(s.data);
  assert.throws(() => act(s,{type:'settings',settings:{...s.data.state,blueTeam:{...s.data.state.blueTeam,players:['A1','A2','A3','A4','A5']}}}), /usedByPlayer/);
  assert.deepEqual(s.data,before);
  assert.throws(() => act(s,{type:'settings',settings:{...s.data.state,blueTeam:{...s.data.state.blueTeam,players:['','A2','A3','A4','A5']}}}), /playerMissing/);
  assert.deepEqual(s.data,before);
});


test('Global BP blocks opponent history bans after either swap, without consuming a slot or revision', () => {
  for (const sideSwapMode of ['moveTeams', 'colorsOnly'] as const) {
    const s = setup('global'); fill(s);
    const first = structuredClone(s.data.state);
    advance(s);
    const before = structuredClone(s.data);
    assert.throws(() => act(s, {type:'draft_action',team:'blue',action:'ban',heroId:first.redPicks[0]}), /opponentAlreadyUsed/);
    assert.deepEqual(s.data, before);
    act(s,{type:'draft_action',team:'blue',action:'ban',heroId:first.bluePicks[0]});
    const redTurn = structuredClone(s.data);
    assert.throws(() => act(s,{type:'draft_action',team:'red',action:'ban',heroId:first.bluePicks[1]}), /opponentAlreadyUsed/);
    assert.deepEqual(s.data,redTurn);
    act(s,{type:'undo'});
    assert.equal(banRestriction(s.data.state,'blue',first.redPicks[0]),'opponentAlreadyUsed');
    act(s,{type:'settings',settings:{...s.data.state,sideSwapMode,firstPickSide:'red'}});
    act(s,{type:'swap_sides'});
    assert.equal(banRestriction(s.data.state,'red',first.redPicks[0]),'opponentAlreadyUsed');
    assert.throws(() => act(s,{type:'draft_action',team:'red',action:'ban',heroId:first.redPicks[0]}), /opponentAlreadyUsed/);
    act(s,{type:'draft_action',team:'red',action:'ban',heroId:first.bluePicks[0]});
    act(s,{type:'reset_draft'});
    assert.equal(banRestriction(s.data.state,'red',first.redPicks[0]),'opponentAlreadyUsed');
    act(s,{type:'reset_match'});
    assert.equal(banRestriction(s.data.state,'red',first.redPicks[0]),undefined);
  }
});

test('opponent-ban protection only uses committed picks in Global BP, not bans or uncommitted drafts', () => {
  for (const mode of ['normal','player','global'] as const) {
    const s=setup(mode); fill(s); const first=structuredClone(s.data.state);
    assert.equal(banRestriction(s.data.state,'blue',first.redPicks[0]),undefined);
    advance(s);
    assert.equal(banRestriction(s.data.state,'blue',first.redBans[0]!),undefined);
    if(mode==='global') assert.equal(banRestriction(s.data.state,'blue',first.redPicks[0]),'opponentAlreadyUsed');
    else {
      act(s,{type:'draft_action',team:'blue',action:'ban',heroId:first.redPicks[0]});
      assert.equal(s.data.state.blueBans[0],first.redPicks[0]);
    }
  }
});

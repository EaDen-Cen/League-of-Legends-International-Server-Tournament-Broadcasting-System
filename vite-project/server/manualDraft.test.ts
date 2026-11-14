import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.js';
import heroes from '../src/components/HeroList.js';
import type { Action, DraftStage, GameRules, MatchState } from '../src/shared/types.js';
import { draftPhases, legacyGameRules } from '../src/shared/gameRules.js';
import { draftHeroUsed, draftRestriction } from '../src/shared/draftRules.js';

const act = (s: Store, action: Action) => s.apply(randomUUID(), s.data.revision, action, {role:'control'});
const stages: DraftStage[] = [
  {team:'blue', action:'pick', count:2}, {team:'red', action:'pick', count:2},
  {team:'blue', action:'pick', count:2}, {team:'red', action:'pick', count:2},
  {team:'blue', action:'pick', count:1}, {team:'red', action:'pick', count:1},
];
function setup(s = new Store(), overrides: Partial<GameRules> = {}) {
  act(s,{type:'current_rules', rules:{...legacyGameRules(s.data.state), stages, ...overrides}});
  return s;
}
function fill(s: Store, start = 0) {
  while (!s.data.state.draftComplete) {
    const state = s.data.state, phase = draftPhases(state)[state.currentPhase];
    const ids = heroes.slice(start).filter(hero => !draftHeroUsed(state, hero.id) && !draftRestriction(state,phase.team,phase.action,hero.id)).slice(0,phase.count).map(hero => hero.id);
    act(s,{type:'draft_group',team:phase.team,action:phase.action,heroIds:ids});
  }
}

test('zero bans still records five picks per team; grouped picks commit once and atomically', () => {
  const s=setup();
  const id=randomUUID(), revision=s.data.revision;
  const before=structuredClone(s.data);
  assert.throws(()=>s.apply(id,revision,{type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[0].id]}));
  assert.deepEqual(s.data,before);
  assert.throws(()=>act(s,{type:'draft_action',team:'blue',action:'pick',heroId:heroes[0].id}),/全部英雄/);
  const action:Action={type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[1].id]};
  s.apply(id,revision,action); s.apply(id,revision,action);
  assert.equal(s.data.state.currentPhase,1); assert.equal(s.data.state.bluePicks.length,2);
  fill(s);
  const gameId=s.data.state.gameId;
  act(s,{type:'commit_game'});
  assert.equal(s.data.state.draftHistory[0].id,gameId);
  assert.deepEqual(s.data.state.blueBans,[]);
  assert.equal(s.data.state.bluePicks.length,5);
  const restored=new Store(); restored.restoreBackup(JSON.parse(JSON.stringify(s.exportBackup())));
  assert.equal(restored.data.state.draftHistory[0].id,gameId);
});

test('clear, refill, replacement and assignment changes retain slot order, ID and score after commit', () => {
  const s=setup(); fill(s); act(s,{type:'commit_game'});
  act(s,{type:'score',team:'blue',delta:1});
  const old=structuredClone(s.data.state), gameId=old.gameId;
  const slotId=draftPhases(old)[0].slots[0];
  act(s,{type:'correct_slot',gameId,slotId,heroId:null,reason:'clear middle'});
  assert.equal(s.data.state.bpPaused,true);
  assert.equal(s.data.state.bluePicks[0],null);
  assert.equal(s.data.state.bluePicks[1],old.bluePicks[1]);
  assert.equal(s.data.state.currentPhase,old.currentPhase);
  assert.throws(()=>act(s,{type:'pause_draft',paused:false}),/补齐/);
  const replacement=heroes.find(hero=>!draftHeroUsed(s.data.state,hero.id))!.id;
  act(s,{type:'correct_slot',gameId,slotId,heroId:replacement,reason:'restore slot'});
  assert.equal(s.data.state.blueAssignments[0],replacement);
  assert.equal(s.data.state.draftHistory[0].bluePicks[0],replacement);
  act(s,{type:'swap_assignments',team:'blue',from:0,to:1});
  assert.equal(s.data.state.draftHistory[0].blueAssignments[1],replacement);
  assert.equal(s.data.state.bluePicks[0],replacement);
  assert.equal(s.data.state.gameId,gameId); assert.equal(s.data.state.blueScore,1);
  const before=structuredClone(s.data);
  assert.throws(()=>act(s,{type:'correct_slot',gameId,slotId,heroId:999999,reason:'invalid'}));
  assert.deepEqual(s.data,before);
});

test('skip and empty are distinct; rewind explicitly clears all later results without renumbering game', () => {
  const s=new Store();
  act(s,{type:'skip_ban',team:'blue'});
  assert.equal(s.data.state.draftSlots['step-0-slot-0'].status,'skipped');
  act(s,{type:'draft_action',team:'red',action:'ban',heroId:heroes[0].id});
  const gameId=s.data.state.gameId;
  act(s,{type:'correct_slot',gameId,slotId:'step-0-slot-0',heroId:null,reason:'missing'});
  assert.equal(s.data.state.draftSlots['step-0-slot-0'].status,'empty');
  assert.equal(s.data.state.redBans[0],heroes[0].id);
  act(s,{type:'rewind_draft',gameId,step:0,reason:'restart here'});
  assert.equal(s.data.state.currentPhase,0); assert.deepEqual(s.data.state.redBans,[]);
  act(s,{type:'pause_draft',paused:false}); act(s,{type:'skip_ban',team:'blue'});
  assert.equal(s.data.state.gameId,gameId);
});

test('history correction targets gameId and reports later fearless conflicts without rewriting later games', () => {
  const s=setup(undefined,{draftRuleMode:'global'}); fill(s); act(s,{type:'commit_game'});
  const first=structuredClone(s.data.state.draftHistory[0]);
  act(s,{type:'score',team:'blue',delta:1}); act(s,{type:'next_game'});
  setup(s,{draftRuleMode:'global'}); fill(s,20); act(s,{type:'commit_game'});
  const second=structuredClone(s.data.state.draftHistory[1]);
  const hero=second.bluePicks[0]!;
  act(s,{type:'correct_slot',gameId:first.id,slotId:'step-0-slot-0',heroId:hero,reason:'historical correction'});
  assert.equal(s.data.state.draftHistory[0].bluePicks[0],hero);
  assert.deepEqual(s.data.state.draftHistory[1],second);
  assert.equal(s.data.state.ruleConflicts[0].gameId,second.id);
  assert.throws(()=>act(s,{type:'pause_draft',paused:false}),/usedByTeam/);
  const restored=new Store(); restored.restoreBackup(JSON.parse(JSON.stringify(s.exportBackup())));
  assert.equal(restored.data.state.ruleConflicts[0].gameId,second.id);
});

test('paused rule changes validate the hero pool and never silently remove confirmed slots', () => {
  const s=new Store(); act(s,{type:'skip_ban',team:'blue'});
  assert.throws(()=>act(s,{type:'current_rules',rules:{...legacyGameRules(s.data.state),stages}}),/暂停/);
  act(s,{type:'pause_draft',paused:true});
  assert.throws(()=>act(s,{type:'current_rules',rules:{...legacyGameRules(s.data.state),stages}}),/删除/);
  const t=setup(undefined,{heroPool:heroes.slice(0,10).map(hero=>hero.id)});
  assert.throws(()=>act(t,{type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[11].id]}),/英雄池/);
  assert.equal(t.data.state.currentPhase,0);
});

test('restart is paused; valid backup restores content with fresh revision and invalid IDs leave state unchanged', () => {
  const file=join(mkdtempSync(join(tmpdir(),'lol-manual-')),'match.json');
  const s=setup(new Store(file)); act(s,{type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[1].id]});
  const restored=new Store(file);
  assert.equal(restored.data.state.bpPaused,true);
  assert.equal(restored.data.state.gameId,s.data.state.gameId);
  assert.throws(()=>act(restored,{type:'draft_group',team:'red',action:'pick',heroIds:[heroes[2].id,heroes[3].id]}),/暂停/);
  const backup=JSON.parse(JSON.stringify(s.exportBackup()));
  const id=backup.state.gameId;
  act(restored,{type:'reset_match'}); const revision=restored.data.revision;
  restored.restoreBackup(backup);
  assert.equal(restored.data.revision,revision+1); assert.equal(restored.data.state.gameId,id); assert.equal(restored.data.state.bpPaused,true);
  const before=structuredClone(restored.data);
  const corrupt=JSON.parse(JSON.stringify(backup)); corrupt.state.draftSlots['step-0-slot-0'].heroId=999999;
  assert.throws(()=>restored.restoreBackup(corrupt)); assert.deepEqual(restored.data,before);
  corrupt.state=JSON.parse(JSON.stringify(backup.state)) as MatchState; corrupt.state.gameId='../wrong';
  assert.throws(()=>restored.restoreBackup(corrupt)); assert.deepEqual(restored.data,before);
});

test('paused side changes keep picks and player identity attached to the real team', () => {
  const s=setup();
  act(s,{type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[1].id]});
  const teamId=s.data.state.blueTeam.id, gameId=s.data.state.gameId, players=[...s.data.state.blueTeam.playerIds!];
  act(s,{type:'pause_draft',paused:true}); act(s,{type:'swap_sides'});
  assert.equal(s.data.state.redTeam.id,teamId);
  assert.deepEqual(s.data.state.redTeam.playerIds,players);
  assert.deepEqual(s.data.state.redPicks,[heroes[0].id,heroes[1].id]);
  assert.equal(draftPhases(s.data.state)[0].team,'red');
  assert.equal(s.data.state.gameId,gameId);
  act(s,{type:'pause_draft',paused:false}); fill(s);
  assert.equal(s.data.state.draftComplete,true);
});

test('supplementing future slots preserves their positions and explicit advance does not select again', () => {
  const s=setup(), gameId=s.data.state.gameId;
  act(s,{type:'correct_slot',gameId,slotId:'step-2-slot-0',heroId:heroes[2].id,reason:'late record'});
  act(s,{type:'correct_slot',gameId,slotId:'step-2-slot-1',heroId:heroes[3].id,reason:'late record'});
  assert.equal(s.data.state.currentPhase,0);
  act(s,{type:'pause_draft',paused:false});
  act(s,{type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[1].id]});
  act(s,{type:'draft_group',team:'red',action:'pick',heroIds:[heroes[4].id,heroes[5].id]});
  act(s,{type:'advance_draft'});
  assert.equal(s.data.state.currentPhase,3);
  assert.deepEqual(s.data.state.bluePicks,[heroes[0].id,heroes[1].id,heroes[2].id,heroes[3].id]);
  assert.deepEqual(s.data.state.blueAssignments,[heroes[0].id,heroes[1].id,heroes[2].id,heroes[3].id,null]);
});

test('duplicate picks can be enabled while bans remain exclusive', () => {
  const s=setup(undefined,{allowDuplicates:true});
  act(s,{type:'draft_group',team:'blue',action:'pick',heroIds:[heroes[0].id,heroes[0].id]});
  act(s,{type:'draft_group',team:'red',action:'pick',heroIds:[heroes[0].id,heroes[0].id]});
  assert.deepEqual(s.data.state.redPicks,[heroes[0].id,heroes[0].id]);
  const t=new Store();
  act(t,{type:'current_rules',rules:{...legacyGameRules(t.data.state),allowDuplicates:true}});
  act(t,{type:'draft_action',team:'blue',action:'ban',heroId:heroes[0].id});
  assert.throws(()=>act(t,{type:'draft_action',team:'red',action:'ban',heroId:heroes[0].id}),/已被选择或禁用/);
});

test('display position and player order change independently from side, identity and original pick order', () => {
  const s=setup();
  act(s,{type:'settings',settings:{...s.data.state,blueTeam:{...s.data.state.blueTeam,players:['A','B','C','D','E'],playerPortraits:['/a.png','/b.png','','','']}}});
  fill(s); act(s,{type:'commit_game'});
  const before=structuredClone(s.data.state);
  act(s,{type:'swap_display'});
  assert.equal(s.data.state.displayLeftSide,'red');
  assert.equal(s.data.state.blueTeam.id,before.blueTeam.id);
  assert.deepEqual(s.data.state.bluePicks,before.bluePicks);
  act(s,{type:'reorder_players',team:'blue',from:0,to:2});
  assert.deepEqual(s.data.state.blueTeam.players,['B','C','A','D','E']);
  assert.equal(s.data.state.blueTeam.playerIds![2],before.blueTeam.playerIds![0]);
  assert.equal(s.data.state.blueTeam.playerPortraits[2],'/a.png');
  assert.equal(s.data.state.blueAssignments[2],before.blueAssignments[0]);
  assert.deepEqual(s.data.state.bluePicks,before.bluePicks);
  assert.deepEqual(s.data.state.draftHistory[0].blueTeam,s.data.state.blueTeam);
  assert.equal(s.data.state.gameId,before.gameId);
});

test('lineup confirmation records only stable team identity and never advances, archives or scores', () => {
  const s=setup();
  assert.throws(()=>act(s,{type:'confirm_lineup',team:'blue'}),/completeDraftFirst/);
  fill(s);
  const phase=s.data.state.currentPhase, gameId=s.data.state.gameId;
  const action:Action={type:'confirm_lineup',team:'blue'}, id=randomUUID(), revision=s.data.revision;
  s.apply(id,revision,action); s.apply(id,revision,action);
  act(s,{type:'confirm_lineup',team:'blue'});
  assert.deepEqual(s.data.state.lineupConfirmedTeamIds,[s.data.state.blueTeam.id]);
  assert.equal(s.data.state.currentPhase,phase); assert.equal(s.data.state.gameId,gameId);
  assert.equal(s.data.state.blueScore,0); assert.equal(s.data.state.committedGameId,null);
  act(s,{type:'swap_display'});
  assert.deepEqual(s.data.state.lineupConfirmedTeamIds,[s.data.state.blueTeam.id]);
  act(s,{type:'pause_draft',paused:true});
  assert.throws(()=>act(s,{type:'confirm_lineup',team:'red'}),/暂停/);
  act(s,{type:'pause_draft',paused:false}); act(s,{type:'confirm_lineup',team:'red'});
  const backup=JSON.parse(JSON.stringify(s.exportBackup()));
  const restored=new Store(); restored.restoreBackup(backup);
  assert.equal(restored.data.state.lineupConfirmedTeamIds.length,2);
  act(s,{type:'commit_game'});
  assert.equal(s.data.state.draftHistory[0].lineupConfirmedTeamIds?.length,2);
  assert.throws(()=>act(s,{type:'confirm_lineup',team:'red'}),/gameAlreadyCommitted/);
  act(s,{type:'correct_slot',gameId,slotId:'step-0-slot-0',heroId:heroes[30].id,reason:'confirmed correction'});
  assert.deepEqual(s.data.state.lineupConfirmedTeamIds,[]);
  assert.deepEqual(s.data.state.draftHistory[0].lineupConfirmedTeamIds,[]);
});

test('lineup ownership changes and explicit substitutions cancel confirmations', () => {
  const s=setup(); fill(s);
  act(s,{type:'confirm_lineup',team:'blue'});
  act(s,{type:'swap_assignments',team:'blue',from:0,to:1});
  assert.deepEqual(s.data.state.lineupConfirmedTeamIds,[]);
  act(s,{type:'confirm_lineup',team:'blue'});
  const ids=[...s.data.state.blueTeam.playerIds!]; ids[0]=randomUUID();
  act(s,{type:'settings',settings:{...s.data.state,blueTeam:{...s.data.state.blueTeam,playerIds:ids}}});
  assert.deepEqual(s.data.state.lineupConfirmedTeamIds,[]);
});

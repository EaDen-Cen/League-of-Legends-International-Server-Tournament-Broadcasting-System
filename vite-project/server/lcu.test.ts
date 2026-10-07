import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState, phases } from '../src/shared/types.js';
import { mapLcuSession, type LcuChampSelectAction, type LcuChampSelectSession } from './lcu.js';

test('LCU champ-select actions map to authoritative blue/red phases',()=>{
  const state=initialState();
  state.draftMode='match';
  state.firstPickSide='blue';
  const expected=phases(state.draftMode,state.firstPickSide);
  const localSide='red';
  const actions:LcuChampSelectAction[]=expected.map((phase,index)=>({
    id:index+1,
    actorCellId:phase.team===localSide?10:20,
    championId:index+1,
    completed:index<7,
    type:phase.action,
    isAllyAction:phase.team===localSide,
    pickTurn:index+1,
  }));
  const session:LcuChampSelectSession={actions:actions.map(action=>[action]),myTeam:[{cellId:10}],theirTeam:[{cellId:20}]};
  const mapped=mapLcuSession(session,state);
  assert.equal(mapped.localSide,'red');
  assert.deepEqual(mapped.actions.map(action=>({side:action.side,action:action.action})),expected.map(phase=>({side:phase.team,action:phase.action})));
  assert.equal(mapped.actions.filter(action=>action.completed).length,7);
});

test('LCU side mapping falls back to cell membership when isAllyAction is absent',()=>{
  const state=initialState();
  const expected=phases(state.draftMode,state.firstPickSide);
  const first: LcuChampSelectAction={
    id:1,actorCellId:44,championId:1,completed:true,type:expected[0].action,
  };
  const second: LcuChampSelectAction={
    id:2,actorCellId:55,championId:2,completed:true,type:expected[1].action,
  };
  const session:LcuChampSelectSession={
    actions:[[first],[second]],
    myTeam:[{cellId:44}],
    theirTeam:[{cellId:55}],
  };
  const mapped=mapLcuSession(session,state);
  assert.equal(mapped.localSide,expected[0].team);
  assert.equal(mapped.actions[0].side,expected[0].team);
  assert.equal(mapped.actions[1].side,expected[1].team);
});

test('LCU observer session can sync by turn order without ally-side evidence',()=>{
  const state=initialState();
  const mapped=mapLcuSession({
    actions:[[{id:1,actorCellId:7,championId:1,completed:true,type:'ban'}]],
  },state);
  assert.equal(mapped.localSide,undefined);
  assert.equal(mapped.actions[0].side,'blue');
  assert.equal(mapped.actions[0].action,'ban');
  assert.equal(mapped.actions[0].championId,1);
});


test('LCU pick-only custom AI rooms map picks onto tournament pick phases',()=>{
  const state=initialState();
  state.firstPickSide='blue';
  const expected=phases(state.draftMode,state.firstPickSide);
  const pickPhases=expected.map((phase,index)=>({phase,index})).filter(item=>item.phase.action==='pick');
  const actions:LcuChampSelectAction[]=pickPhases.map((item,index)=>({
    id:index+100,
    actorCellId:item.phase.team==='blue'?10:20,
    championId:1000+index,
    completed:true,
    type:'pick',
    isAllyAction:item.phase.team==='blue',
  }));
  const mapped=mapLcuSession({actions:actions.map(action=>[action]),myTeam:[{cellId:10}],theirTeam:[{cellId:20}]},state);
  assert.equal(mapped.mode,'pick-only-practice');
  assert.equal(mapped.localSide,'blue');
  assert.deepEqual(mapped.actions.map(action=>action.phaseIndex),pickPhases.map(item=>item.index));
  assert.ok(mapped.actions.every(action=>action.action==='pick'));
});

test('LCU non-standard mixed rooms are rejected instead of silently remapped',()=>{
  const state=initialState();
  assert.throws(()=>mapLcuSession({
    actions:[
      [{id:1,actorCellId:1,championId:1,completed:true,type:'pick'}],
      [{id:2,actorCellId:2,championId:2,completed:true,type:'ban'}],
    ],
  },state),/does not match tournament BP/);
});


test('LCU AI room with dummy ban action is still detected as pick-only practice',()=>{
  const state=initialState();
  state.firstPickSide='blue';
  const expected=phases(state.draftMode,state.firstPickSide);
  const pickPhases=expected.map((phase,index)=>({phase,index})).filter(item=>item.phase.action==='pick');
  const picks:LcuChampSelectAction[]=pickPhases.map((item,index)=>({
    id:200+index,
    actorCellId:item.phase.team==='blue'?10+index:20+index,
    championId:3000+index,
    completed:index!==0,
    type:'pick',
    isAllyAction:item.phase.team==='blue',
  }));
  const dummyBan:LcuChampSelectAction={
    id:99,
    actorCellId:10,
    championId:0,
    completed:false,
    type:'ban',
    isAllyAction:true,
  };
  const session:LcuChampSelectSession={
    actions:[[dummyBan],...picks.map(action=>[action])],
    myTeam:picks.filter(action=>action.isAllyAction).map(action=>({cellId:action.actorCellId})),
    theirTeam:picks.filter(action=>!action.isAllyAction).map(action=>({cellId:action.actorCellId})),
  };
  const mapped=mapLcuSession(session,state);
  assert.equal(mapped.mode,'pick-only-practice');
  assert.equal(mapped.actions.length,10);
  assert.ok(mapped.actions.every(action=>action.action==='pick'));
  assert.ok(!mapped.actions.some(action=>action.id===dummyBan.id));
});


test('LCU finalization with one dummy ban and one local pick syncs ten roster champions',()=>{
  const state=initialState();
  state.firstPickSide='blue';
  const session:LcuChampSelectSession={
    timer:{phase:'FINALIZATION'},
    actions:[
      [{id:1,actorCellId:1,championId:0,completed:true,type:'ban',isAllyAction:true}],
      [{id:2,actorCellId:1,championId:54,completed:true,type:'pick',isAllyAction:true}],
      [],
    ],
    myTeam:[
      {cellId:1,championId:54},
      {cellId:2,championId:115},
      {cellId:3,championId:147},
      {cellId:4,championId:131},
      {cellId:5,championId:32},
    ],
    theirTeam:[
      {cellId:11,championId:31},
      {cellId:12,championId:82},
      {cellId:13,championId:902},
      {cellId:14,championId:127},
      {cellId:15,championId:236},
    ],
  };
  const mapped=mapLcuSession(session,state);
  assert.equal(mapped.mode,'pick-only-practice');
  assert.equal(mapped.localSide,'blue');
  assert.equal(mapped.actions.length,10);
  assert.deepEqual(
    new Set(mapped.actions.map(action=>action.championId)),
    new Set([54,115,147,131,32,31,82,902,127,236]),
  );
  assert.ok(mapped.actions.every(action=>action.action==='pick'));
  assert.ok(mapped.actions.every(action=>action.completed));
});

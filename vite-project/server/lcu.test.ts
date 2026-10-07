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

test('LCU session without side evidence is rejected instead of guessing',()=>{
  const state=initialState();
  assert.throws(()=>mapLcuSession({
    actions:[[{id:1,actorCellId:7,championId:1,completed:true,type:'ban'}]],
  },state),/side mapping is unavailable/);
});

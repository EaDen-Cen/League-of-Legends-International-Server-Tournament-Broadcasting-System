import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureSlotKeys,
  captureTargetForState,
  defaultCaptureSlots,
  normalizeCaptureSlots,
  slotMeta,
} from '../src/control/bpCaptureLayout.js';

test('capture layout exposes exactly 20 independently stored slots',()=>{
  assert.equal(captureSlotKeys.length,20);
  assert.equal(new Set(captureSlotKeys).size,20);
  assert.equal(captureSlotKeys.filter(key=>key.includes('Ban')).length,10);
  assert.equal(captureSlotKeys.filter(key=>key.includes('Pick')).length,10);

  const changed=normalizeCaptureSlots(defaultCaptureSlots);
  const originalOther=structuredClone(changed.redPick5);
  changed.blueBan1={x:.51,y:.52,width:.12,height:.13};
  assert.deepEqual(changed.redPick5,originalOther);
  assert.notDeepEqual(changed.blueBan1,defaultCaptureSlots.blueBan1);
});

test('match BP maps every phase to one explicit slot key',()=>{
  const state={draftMode:'match' as const,firstPickSide:'blue' as const,currentPhase:0};
  const expected=[
    'blueBan1','redBan1','blueBan2','redBan2','blueBan3','redBan3',
    'bluePick1','redPick1','redPick2','bluePick2','bluePick3','redPick3',
    'redBan4','blueBan4','redBan5','blueBan5',
    'redPick4','bluePick4','bluePick5','redPick5',
  ];
  for(let phase=0;phase<expected.length;phase++) {
    const target=captureTargetForState({...state,currentPhase:phase},defaultCaptureSlots)!;
    assert.equal(target.key,expected[phase]);
    assert.deepEqual(target.region,defaultCaptureSlots[expected[phase] as keyof typeof defaultCaptureSlots]);
  }
});

test('red first-pick mirrors the team ownership without changing slot numbers',()=>{
  const state={draftMode:'match' as const,firstPickSide:'red' as const,currentPhase:0};
  assert.equal(captureTargetForState(state,defaultCaptureSlots)!.key,'redBan1');
  assert.equal(captureTargetForState({...state,currentPhase:6},defaultCaptureSlots)!.key,'redPick1');
  assert.equal(captureTargetForState({...state,currentPhase:19},defaultCaptureSlots)!.key,'bluePick5');
});

test('normal BP uses only B1/B2 while keeping all 20 calibration boxes available',()=>{
  const state={draftMode:'normal' as const,firstPickSide:'blue' as const,currentPhase:0};
  const keys=Array.from({length:14},(_,phase)=>captureTargetForState({...state,currentPhase:phase},defaultCaptureSlots)!.key);
  assert.ok(keys.includes('blueBan1'));
  assert.ok(keys.includes('blueBan2'));
  assert.ok(keys.includes('redBan1'));
  assert.ok(keys.includes('redBan2'));
  assert.equal(keys.some(key=>key==='blueBan3'||key==='blueBan4'||key==='redBan3'||key==='redBan4'),false);
  assert.equal(captureSlotKeys.length,20);
});

test('slot metadata is explicit and stable',()=>{
  assert.deepEqual(slotMeta('blueBan4'),{side:'blue',action:'ban',index:3});
  assert.deepEqual(slotMeta('redPick5'),{side:'red',action:'pick',index:4});
});

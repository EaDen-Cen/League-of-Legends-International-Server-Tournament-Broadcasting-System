import { phases, type MatchState, type Side } from '../shared/types.js';
import { normalizeCaptureRegion, type NormalizedCaptureRegion } from './windowCaptureGeometry.js';

export type CaptureSlotKey =
  | 'blueBan1' | 'blueBan2' | 'blueBan3' | 'blueBan4' | 'blueBan5'
  | 'redBan1' | 'redBan2' | 'redBan3' | 'redBan4' | 'redBan5'
  | 'bluePick1' | 'bluePick2' | 'bluePick3' | 'bluePick4' | 'bluePick5'
  | 'redPick1' | 'redPick2' | 'redPick3' | 'redPick4' | 'redPick5';

export type CaptureSlots = Record<CaptureSlotKey, NormalizedCaptureRegion>;

export interface LegacyCaptureZones {
  bluePick: NormalizedCaptureRegion;
  redPick: NormalizedCaptureRegion;
  blueBan: NormalizedCaptureRegion;
  redBan: NormalizedCaptureRegion;
}

export interface CaptureTarget {
  key: CaptureSlotKey;
  side: Side;
  action: 'ban' | 'pick';
  slotIndex: number;
  slotCount: number;
  region: NormalizedCaptureRegion;
}

export const captureSlotKeys: CaptureSlotKey[] = [
  'blueBan1','blueBan2','blueBan3','blueBan4','blueBan5',
  'redBan1','redBan2','redBan3','redBan4','redBan5',
  'bluePick1','bluePick2','bluePick3','bluePick4','bluePick5',
  'redPick1','redPick2','redPick3','redPick4','redPick5',
];

export const defaultLegacyZones: LegacyCaptureZones = {
  bluePick: { x:.035, y:.18, width:.105, height:.68 },
  redPick: { x:.86, y:.18, width:.105, height:.68 },
  blueBan: { x:.035, y:.035, width:.28, height:.11 },
  redBan: { x:.685, y:.035, width:.28, height:.11 },
};

function inset(region:NormalizedCaptureRegion, ratio=.07):NormalizedCaptureRegion {
  const xPad=region.width*ratio;
  const yPad=region.height*ratio;
  return normalizeCaptureRegion({
    x:region.x+xPad,
    y:region.y+yPad,
    width:Math.max(.02,region.width-xPad*2),
    height:Math.max(.02,region.height-yPad*2),
  });
}

function splitLegacyZone(
  zone:NormalizedCaptureRegion,
  action:'ban'|'pick',
  slotIndex:number,
  slotCount:number,
):NormalizedCaptureRegion {
  if(action==='pick') {
    return inset({
      x:zone.x,
      y:zone.y+zone.height*(slotIndex/slotCount),
      width:zone.width,
      height:zone.height/slotCount,
    },.08);
  }
  return inset({
    x:zone.x+zone.width*(slotIndex/slotCount),
    y:zone.y,
    width:zone.width/slotCount,
    height:zone.height,
  },.08);
}

/**
 * One-time migration/default helper only.
 * Runtime recognition never derives a slot from a row/column: every returned
 * rectangle is copied into an independent key and can be calibrated separately.
 */
export function slotsFromLegacyZones(zones:LegacyCaptureZones):CaptureSlots {
  const result={} as CaptureSlots;
  for(const side of ['blue','red'] as const) {
    for(let i=0;i<5;i++) {
      result[`${side}Ban${i+1}` as CaptureSlotKey]=splitLegacyZone(zones[`${side}Ban`], 'ban', i, 5);
    }
    for(let i=0;i<5;i++) {
      result[`${side}Pick${i+1}` as CaptureSlotKey]=splitLegacyZone(zones[`${side}Pick`], 'pick', i, 5);
    }
  }
  return result;
}

export const defaultCaptureSlots:CaptureSlots=slotsFromLegacyZones(defaultLegacyZones);

export function normalizeCaptureSlots(value:Partial<CaptureSlots>|undefined):CaptureSlots {
  return Object.fromEntries(captureSlotKeys.map(key=>[
    key,
    normalizeCaptureRegion(value?.[key] ?? defaultCaptureSlots[key]),
  ])) as CaptureSlots;
}

export function slotMeta(key:CaptureSlotKey) {
  const match=/^(blue|red)(Ban|Pick)([1-5])$/.exec(key);
  if(!match) throw new Error(`Invalid capture slot: ${key}`);
  return {
    side:match[1] as Side,
    action:match[2].toLowerCase() as 'ban'|'pick',
    index:Number(match[3])-1,
  };
}

function previousSlotIndex(
  state:Pick<MatchState,'draftMode'|'firstPickSide'|'currentPhase'>,
  side:Side,
  action:'ban'|'pick',
) {
  return phases(state.draftMode,state.firstPickSide)
    .slice(0,state.currentPhase)
    .filter(phase=>phase.team===side&&phase.action===action)
    .length;
}

export function slotCountFor(state:Pick<MatchState,'draftMode'>, action:'ban'|'pick') {
  return action==='pick' ? 5 : (state.draftMode==='match' ? 5 : 2);
}

export function captureTargetForState(
  state:Pick<MatchState,'draftMode'|'firstPickSide'|'currentPhase'>,
  slots:CaptureSlots,
):CaptureTarget|undefined {
  const phase=phases(state.draftMode,state.firstPickSide)[state.currentPhase];
  if(!phase) return undefined;
  const slotIndex=previousSlotIndex(state,phase.team,phase.action);
  const slotCount=slotCountFor(state,phase.action);
  const key=`${phase.team}${phase.action==='ban'?'Ban':'Pick'}${slotIndex+1}` as CaptureSlotKey;
  return {
    key,
    side:phase.team,
    action:phase.action,
    slotIndex,
    slotCount,
    region:slots[key],
  };
}

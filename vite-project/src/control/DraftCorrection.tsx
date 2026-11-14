import { useState } from 'react';
import { draftPhases } from '../shared/gameRules';
import { heroesForState } from '../shared/heroData';
import type { Action, MatchState } from '../shared/types';

export function DraftCorrection({ state, send, disabled }: { state: MatchState; send: (action: Action) => void; disabled: boolean }) {
  const [gameId, setGameId] = useState(state.gameId);
  const [slotId, setSlotId] = useState('');
  const [hero, setHero] = useState('');
  const [reason, setReason] = useState('');
  const record = state.draftHistory.find(game => game.id === gameId);
  const zh = state.language === 'zh';
  const target = record ? { ...state, ...record, currentGameRules: record.rules } : state;
  const steps = draftPhases(target);
  const selectedPhase = steps.find(phase => phase.slots.includes(slotId));
  return <details className="panel draft-correction"><summary>{zh ? '已锁定 / 历史 BP 纠错与回退' : 'Correct locked / historical BP'}</summary>
    <p>{zh ? '替换保持进度。清空中间槽位会暂停并保留后续结果；回退会明确清空后续步骤。' : 'Replacement preserves progress. Clearing a slot pauses the draft; rewinding clears later steps.'}</p>
    <label>{zh ? '对局' : 'Game'}<select aria-label="Correction game" value={gameId} onChange={event => { setGameId(event.target.value); setSlotId(''); }}><option value={state.gameId}>{zh ? '当前局' : 'Current game'}</option>{state.draftHistory.filter(game => game.id !== state.gameId).map(game => <option key={game.id} value={game.id}>Game {game.gameNumber}</option>)}</select></label>
    <label>{zh ? '步骤 / 槽位' : 'Step / slot'}<select aria-label="Correction slot" value={slotId} onChange={event => setSlotId(event.target.value)}><option value="">—</option>{steps.flatMap((phase, index) => phase.slots.map((slot, offset) => <option key={slot} value={slot}>{index + 1} · {target[`${phase.team}Team`].name} · {phase.action} {offset + 1} · {target.draftSlots?.[slot]?.status ?? 'empty'}</option>))}</select></label>
    <label>{zh ? '更正为' : 'Set slot to'}<select aria-label="Correction champion" value={hero} onChange={event => setHero(event.target.value)}><option value="">{zh ? '尚未填写（清空）' : 'Empty (clear)'}</option>{selectedPhase?.action === 'ban' && <option value="skip">{zh ? '空 Ban / 明确跳过' : 'Explicitly skipped Ban'}</option>}{heroesForState(state).map(item => <option key={item.id} value={item.id}>{zh ? item.chineseName : item.englishName}</option>)}</select></label>
    <label>{zh ? '更正原因' : 'Reason'}<input aria-label="Correction reason" required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <div className="toolbar"><button disabled={disabled || !slotId || reason.trim().length < 3} onClick={() => send({ type: 'correct_slot', gameId, slotId, heroId: hero === 'skip' ? 'skip' : hero ? Number(hero) : null, reason })}>{zh ? '应用槽位更正' : 'Apply correction'}</button>
      <button className="danger" disabled={disabled || !selectedPhase || reason.trim().length < 3} onClick={() => selectedPhase && confirm(zh ? '回退至此步骤并清空此步及后续选择？' : 'Clear this step and every later step?') && send({ type: 'rewind_draft', gameId, step: steps.indexOf(selectedPhase), reason })}>{zh ? '回退至此并清空后续' : 'Rewind and clear later steps'}</button>
    </div>
    {!!state.ruleConflicts?.length && <ul role="alert">{state.ruleConflicts.map((conflict, index) => <li key={index}>{conflict.gameId}: {conflict.reason}</li>)}</ul>}
  </details>;
}

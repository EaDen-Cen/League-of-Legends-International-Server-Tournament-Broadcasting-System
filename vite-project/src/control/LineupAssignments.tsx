import { useState } from 'react';
import { heroForState } from '../shared/heroData';
import type { Action, MatchState, Side } from '../shared/types';

export function LineupAssignments({ state, disabled, send, teamId }: {
  state: MatchState; disabled: boolean; send: (action: Action) => void; teamId?: string;
}) {
  const [gameId, setGameId] = useState('');
  const record = state.draftHistory.find(game => game.id === gameId);
  const target = record ?? state, zh = state.language === 'zh';
  const label = (id: number | null) => { const hero = id === null ? undefined : heroForState(state, id); return (zh ? hero?.chineseName : hero?.englishName) ?? '—'; };
  const change = (side: Side, from: number, to: number) => {
    if (!record) { send({ type: 'swap_assignments', team: side, from, to }); return; }
    const blue = [...record.blueAssignments], red = [...record.redAssignments], values = side === 'blue' ? blue : red;
    [values[from], values[to]] = [values[to], values[from]];
    const reason = prompt(zh ? '历史归属更正原因' : 'Reason for historical correction');
    if (reason && blue.every((id): id is number => id !== null) && red.every((id): id is number => id !== null)) send({ type: 'history_assignments', gameId: record.id, blue, red, reason });
  };
  return <section className="panel lineup-sync"><h2 className="panel-heading">{zh ? '最终英雄归属' : 'Final champion assignments'}</h2>
    <p>{zh ? '调整归属保留原始选人顺序。P1–P5 为玩家席位，不要求固定分路。' : 'Assignments preserve pick order. P1–P5 are player seats; lanes are optional.'}</p>
    {!teamId && <label>{zh ? '对局' : 'Game'}<select value={gameId} onChange={event => setGameId(event.target.value)}><option value="">{zh ? '当前局' : 'Current game'}</option>{state.draftHistory.map(game => <option key={game.id} value={game.id}>Game {game.gameNumber}</option>)}</select></label>}
    <div className="lineup-team-grid">{(['blue', 'red'] as const).filter(side => !teamId || target[`${side}Team`].id === teamId).map(side => <section key={side} className={`lineup-team side-${side}`}><h3 className="team-heading">{target[`${side}Team`].name}</h3>
      {!teamId && !record && <button disabled={disabled || !state.draftComplete || !!state.committedGameId || state.lineupConfirmedTeamIds.includes(target[`${side}Team`].id)} onClick={() => send({ type: 'confirm_lineup', team: side })}>{state.lineupConfirmedTeamIds.includes(target[`${side}Team`].id) ? (zh ? '本队已确认' : 'Lineup confirmed') : (zh ? '导播确认本队阵容' : 'Director: confirm lineup')}</button>}
      {target[`${side}Assignments`].map((_, index, assignments) => <div key={index} className="lineup-player-row"><label className="lineup-player-label"><span className="lineup-seat">P{index + 1}</span><span className="lineup-player-name"> · {target[`${side}Team`].players[index] || '—'}</span>
        <select aria-label={`${side} P${index + 1} champion`} disabled={disabled || (!record && !state.draftComplete)} value={index} onChange={event => change(side, index, Number(event.target.value))}>
          {assignments.map((heroId, slot) => <option key={slot} value={slot}>{label(heroId)}{slot === index ? ' ✓' : ''}</option>)}
        </select>
      </label>{!teamId && !record && <div className="toolbar lineup-order-controls"><button aria-label={`${side} P${index + 1} move up`} disabled={disabled || index === 0} onClick={() => send({type:'reorder_players',team:side,from:index,to:index-1})}>↑</button><button aria-label={`${side} P${index + 1} move down`} disabled={disabled || index === 4} onClick={() => send({type:'reorder_players',team:side,from:index,to:index+1})}>↓</button></div>}</div>)}
    </section>)}</div>
  </section>;
}

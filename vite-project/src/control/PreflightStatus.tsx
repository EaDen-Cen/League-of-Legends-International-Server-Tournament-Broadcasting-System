import { useState } from 'react';
import type { MatchState } from '../shared/types';
import { currentGame, playerIdentity } from '../shared/draftRules';

export function PreflightStatus({ state, connected }: { state: MatchState; connected: boolean }) {
  const zh = state.language === 'zh';
  const fingerprint = JSON.stringify([currentGame(state), state.blueTeam.id, state.redTeam.id,
    state.blueTeam.players, state.redTeam.players, state.blueTeam.playerRoles, state.redTeam.playerRoles]);
  const [confirmed, setConfirmed] = useState('');
  const players = [...state.blueTeam.players, ...state.redTeam.players].map(playerIdentity);
  const complete = players.every(Boolean);
  const unique = new Set(players).size === 10;
  return <details className="panel preflight-status" open={!complete || !connected}>
    <summary>{zh ? '开播预检 / P1–P5 核对' : 'Preflight / P1–P5 verification'} · {confirmed === fingerprint && complete && unique && connected ? '✓' : '⚠'}</summary>
    <p>{connected ? '✓' : '⚠'} {zh ? '服务器实时连接' : 'Live server connection'} · {complete && unique ? '✓' : '⚠'} {zh ? '十名选手已填写且无重复 ID' : 'Ten players with unique IDs'}</p>
    {(['blue', 'red'] as const).map(side => <p key={side}><b>{state[`${side}Team`].name}</b> · {state[`${side}Team`].players.map((player, i) => `P${i + 1} ${player || '—'}`).join(' · ')}</p>)}
    <label><input type="checkbox" checked={confirmed === fingerprint} disabled={!complete || !unique || !connected} onChange={e => setConfirmed(e.target.checked ? fingerprint : '')} />{zh ? '已人工核对本局 P1–P5 顺序与游戏房间一致' : 'I verified this game’s P1–P5 order against the game lobby'}</label>
    <p className="muted">{zh ? '此勾选仅保存在当前页面；换局或选手顺序变化须重新核对。OBS 画面及游戏数据连接请另行实机检查。' : 'This confirmation is page-local and resets for a new game or roster. Check OBS and game data separately on the production machine.'}</p>
  </details>;
}

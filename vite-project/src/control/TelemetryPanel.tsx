import { useState } from 'react';
import type { MatchState } from '../shared/types';
import type { TelemetryField, TelemetryMetric } from '../shared/telemetry';
import { useTelemetry } from '../shared/useTelemetry';
import { apiURL } from '../shared/config';
import { heroForState } from '../shared/heroData';
import { telemetryTeam } from '../shared/telemetryView';

const labels: Record<TelemetryField, string> = { gameTime: '时间 / Time', kills: '击杀 / K', deaths: '死亡 / D', assists: '助攻 / A', level: '等级 / Level', cs: '补刀 / CS', totalGold: '总金币 / Total gold', damageDealt: '对英雄伤害 / Champion damage', damageTaken: '承伤 / Taken', healing: '治疗 / Healing' };
function metricText(metric: TelemetryMetric | undefined) {
  if (!metric || metric.availability === 'unknown') return '—';
  if (metric.availability === 'unsupported') return 'N/A';
  if (metric.availability === 'not-applicable') return '不适用 / N/A';
  return metric.value === null ? '—' : metric.value.toLocaleString();
}
function download(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
export function TelemetryPanel({ state, token, disabled }: { state: MatchState; token: string; disabled: boolean }) {
  const [selectedGame, setSelectedGame] = useState('');
  const gameId = selectedGame || state.gameId;
  const { snapshot, error, refresh } = useTelemetry(gameId, token);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [credential, setCredential] = useState<{ sessionId: string; token: string }>();
  const [playerId, setPlayerId] = useState('');
  const [field, setField] = useState<TelemetryField>('gameTime');
  const [value, setValue] = useState('');
  const zh = state.language === 'zh', sample = snapshot?.sample;
  async function request(path: string, body?: unknown, method = 'POST') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiURL}/api/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Request failed');
      refresh(); return data;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  const roster = selectedGame ? state.draftHistory.find(game => game.id === selectedGame) ?? state : state;
  const comparisons = sample?.players.map(player => {
    const owner = telemetryTeam({ ...state, ...roster }, [player]);
    const ids = owner?.team.playerIds ?? owner?.team.players.map((_, index) => `${owner.team.id}-p${index + 1}`);
    const expectedHero = owner && ids ? roster[`${owner.side}Assignments`][ids.indexOf(player.playerId)] : undefined;
    return { player, owner, expectedHero };
  });
  const mismatch = comparisons?.filter(({ player, expectedHero }) => player.championId !== null && expectedHero != null && player.championId !== expectedHero);
  const unmatched = comparisons?.filter(({ owner }) => !owner);
  return <section className="panel telemetry-panel"><h2>{zh ? '游戏数据 / GHUD / 赛后记录' : 'Game data / GHUD / post-game'}</h2>
    <p>{zh ? '数据通过游戏电脑的只读 Live Client 桥接上传。游戏采集不会修改 BP、比分或自动进入下一局。' : 'The game computer uploads read-only Live Client data. Telemetry cannot change BP, scores or advance games.'}</p>
    <label>{zh ? '查看对局' : 'Game'}<select value={selectedGame} onChange={event => { setSelectedGame(event.target.value); setCredential(undefined); setPlayerId(''); }}><option value="">{zh ? '当前局' : 'Current game'}</option>{state.draftHistory.filter(game => game.id !== state.gameId).map(game => <option value={game.id} key={game.id}>Game {game.gameNumber}</option>)}</select></label>
    <p role="status">{zh ? '连接状态' : 'Connection'}: {snapshot?.status ?? 'waiting'} · {zh ? '最近可信采样' : 'Last trusted sample'}: {snapshot?.lastReceivedAt ? new Date(snapshot.lastReceivedAt).toLocaleTimeString() : '—'}</p>
    {(error || snapshot?.lastError) && <p className="notice">{error || snapshot?.lastError}</p>}
    {!!mismatch?.length && <p className="notice" role="alert">{zh ? '实际英雄与赛事 BP 不一致，请导播确认；两份记录独立保留：' : 'Actual champions differ from BP. Director review required: '}{mismatch.map(({ player }) => `${player.riotId} (${player.championName})`).join(', ')}</p>}
    {!!unmatched?.length && <p className="notice">{zh ? '实际玩家身份未匹配，暂不能核对赛事 BP 归属；请核对 Riot ID 并重新绑定：' : 'Actual player identity is unmatched; BP ownership cannot be compared. Check Riot IDs and bind a new session: '}{unmatched.map(({ player }) => player.riotId).join(', ')}</p>}
    {!!snapshot?.unmatchedManualPlayerIds?.length && <p className="notice">{zh ? '部分人工覆盖尚未匹配当前房间，数据仍保留在导出中：' : 'Unmatched manual player overrides are preserved in export: '}{snapshot.unmatchedManualPlayerIds.join(', ')}</p>}
    {snapshot?.endedHint && <p className="notice">{zh ? '接口提示游戏已结束；请由导播确认胜负、比分与下一局。' : 'Game-end signal received. The director must confirm the result and next game.'}</p>}
    <div className="toolbar"><button disabled={disabled || busy || !!selectedGame} onClick={() => void request('telemetry/session', { matchId: state.matchId, gameId }).then(data => { if (data?.token) setCredential(data); })}>{zh ? '创建 / 轮换采集会话' : 'Create / rotate capture session'}</button>
      <button disabled={disabled || busy || !snapshot?.sessionId} onClick={() => void request(`telemetry/session?gameId=${encodeURIComponent(gameId)}`, undefined, 'DELETE').then(() => setCredential(undefined))}>{zh ? '停止采集会话' : 'Stop capture session'}</button>
      <button disabled={disabled || busy} onClick={() => void request(`telemetry/export?gameId=${encodeURIComponent(gameId)}`, undefined, 'GET').then(data => data && download(data, `lol-${gameId}-telemetry.json`))}>{zh ? 'JSON 导出' : 'Export JSON'}</button>
    </div>
    {credential && <details className="panel"><summary>{zh ? '采集机连接参数（只显示本次生成结果）' : 'Bridge credentials (shown once)'}</summary><p>{zh ? '将凭据保存在采集电脑环境变量中。运行 node --env-file=bridge.env scripts/game-bridge.mjs；公网服务使用实际 HTTPS 地址。' : 'Set these on the game computer, then run node --env-file=bridge.env scripts/game-bridge.mjs with the real HTTPS server address.'}</p><label>BRIDGE_SERVER_URL<input readOnly value={apiURL || location.origin} /></label><label>BRIDGE_MATCH_ID<input readOnly value={state.matchId} /></label><label>BRIDGE_GAME_ID<input readOnly value={gameId} /></label><label>BRIDGE_SESSION_ID<input readOnly value={credential.sessionId} /></label><label>BRIDGE_TOKEN<input readOnly type="password" value={credential.token} /></label><button onClick={() => setCredential(undefined)}>{zh ? '隐藏凭据' : 'Hide credentials'}</button></details>}
    {snapshot?.pending && <section className="notice"><h3>{zh ? '新房间待确认' : 'New game requires confirmation'}</h3><p>{snapshot.pending.sample.gameMode} · {snapshot.pending.sample.mapName}</p><p>{snapshot.pending.sample.players.map(player => `${player.team} ${player.riotId} ${player.championName}`).join(' / ')}</p><button disabled={disabled || busy} onClick={() => void request('telemetry/confirm', { gameId, sessionId: snapshot.sessionId, fingerprint: snapshot.pending?.fingerprint })}>{zh ? '已核对玩家与房间，绑定本局' : 'Verified players and room: bind this game'}</button></section>}
    <p>{labels.gameTime}: {metricText(sample?.gameTime)} s · {sample?.gameTime.source ?? 'unavailable'}{sample?.gameTime.stale ? ' · STALE' : ''}{sample?.gameTime.frozen ? ' · 人工冻结 / FROZEN' : ''}</p>
    <div className="telemetry-table-scroll"><table className="telemetry-table"><thead><tr><th>{zh ? '实际玩家 / 英雄' : 'Actual player / champion'}</th>{(Object.keys(labels) as TelemetryField[]).filter(key => key !== 'gameTime').map(key => <th key={key}>{labels[key]}</th>)}</tr></thead><tbody>{sample?.players.map(player => <tr key={player.playerId}><th>{player.riotId}<small>{player.team} · {player.championId === null ? player.championName || '—' : (heroForState(state, player.championId)?.chineseName ?? player.championName)}</small></th>{Object.entries(player.stats).map(([key, metric]) => <td key={key} className={metric.stale ? 'stale' : ''} title={`${metric.availability} · ${metric.source} · ${metric.updatedAt ? new Date(metric.updatedAt).toLocaleTimeString() : '—'}`}>{metricText(metric)}<small>{metric.source}{metric.frozen ? ' · 冻结/FROZEN' : ''}{metric.stale ? ' · STALE' : ''}</small></td>)}</tr>)}</tbody></table></div>
    <p className="muted">{zh ? '— 未采集；N/A 接口不支持。ARAM 中立资源不适用；总金币、伤害、承伤、治疗在接口未提供时保持未知，不估算。' : '— unknown; N/A unsupported. ARAM neutral objectives are not applicable. Unavailable totals are never estimated.'}</p>
    <form className="telemetry-manual-form" onSubmit={event => { event.preventDefault(); void request('telemetry/manual', { gameId, playerId: field === 'gameTime' ? undefined : playerId, field, value: value.trim() ? Number(value) : null }); }}><h3>{zh ? '人工补录 / 更正并冻结' : 'Manual correction and freeze'}</h3>
      <label>{zh ? '字段' : 'Field'}<select value={field} onChange={event => setField(event.target.value as TelemetryField)}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {field !== 'gameTime' && <label>{zh ? '玩家' : 'Player'}<select required value={playerId} onChange={event => setPlayerId(event.target.value)}><option value="">—</option>{sample?.players.map(player => <option key={player.playerId} value={player.playerId}>{player.team} · {player.riotId || player.playerId}</option>)}</select></label>}
      <label>{zh ? '数值（留空标为未知）' : 'Value (empty = unknown)'}<input type="number" min={0} step={1} value={value} onChange={event => setValue(event.target.value)} /></label>
      <button className="primary" disabled={disabled || busy || (field !== 'gameTime' && !playerId)}>{zh ? '保存并冻结本字段' : 'Save and freeze field'}</button><button type="button" disabled={disabled || busy || (field !== 'gameTime' && !playerId)} onClick={() => void request('telemetry/resume', { gameId, playerId: field === 'gameTime' ? undefined : playerId, field })}>{zh ? '恢复本字段自动更新' : 'Resume automatic updates'}</button>
    </form><p role="status">{message}</p>
    {!!sample?.events.length && <details><summary>{zh ? '已采集事件' : 'Collected events'}</summary><ul>{sample.events.slice(-30).map(event => <li key={event.id}>{event.time ?? '—'}s · {event.name}</li>)}</ul></details>}
  </section>;
}

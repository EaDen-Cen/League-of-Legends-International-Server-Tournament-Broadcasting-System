import type { MatchState } from '../shared/types';
import { useTelemetry } from '../shared/useTelemetry';
import type { TelemetryMetric } from '../shared/telemetry';
import { portraitAssetURL } from '../shared/config';
import { telemetryTeam, telemetryTeamKills } from '../shared/telemetryView';

export function GameHud({ state, token }: { state: MatchState; token: string }) {
  const { snapshot, error } = useTelemetry(state.gameId, token);
  const sample = snapshot?.sample;
  const seconds = sample?.gameTime.value;
  const time = seconds == null ? '--:--' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const number = (metric: TelemetryMetric) => metric.availability === 'available' && metric.value !== null ? metric.value : '—';
  const teams = (['ORDER', 'CHAOS'] as const).map(side => {
    const players = sample?.players.filter(player => player.team === side) ?? [];
    return { side, players, identity: telemetryTeam(state, players), kills: telemetryTeamKills(players) };
  });
  const label = (index: number) => teams[index].identity
    ? `${teams[index].identity!.team.name} · ${teams[index].identity!.score}` : `${teams[index].side} · ${state.language === 'zh' ? '未匹配' : 'Unmatched'}`;
  return <section className="game-hud-overlay" data-testid="game-hud"><header className="game-hud-scoreboard">
    <strong>{label(0)}</strong><b>{teams[0].kills ?? '—'}</b><span>{time}</span><b>{teams[1].kills ?? '—'}</b><strong>{label(1)}</strong>
    {(error || snapshot?.status === 'stale' || snapshot?.status === 'disconnected') && <small>STALE</small>}
  </header><div className="game-hud-players">{teams.map(team => <div key={team.side} className={`hud-team ${team.side}`}>
    {team.players.map(player => <article key={player.playerId}><span>{player.riotId}</span><small>{player.championName}</small><b>{number(player.stats.kills)} / {number(player.stats.deaths)} / {number(player.stats.assists)}</b><span>Lv {number(player.stats.level)} · CS {number(player.stats.cs)}</span>{Object.values(player.stats).some(metric => metric.frozen) && <small>MANUAL</small>}</article>)}
  </div>)}</div><footer>{teams[0].identity?.team.logo && <img src={portraitAssetURL(teams[0].identity.team.logo)} alt="" />}Game {state.draftGameNumber ?? state.gameNumber}{teams[1].identity?.team.logo && <img src={portraitAssetURL(teams[1].identity.team.logo)} alt="" />}</footer></section>;
}

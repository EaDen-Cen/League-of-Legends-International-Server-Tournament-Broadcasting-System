import type { MatchState } from './types.js';
import type { TelemetryPlayer } from './telemetry.js';

/** Incomplete player lists cannot represent a five-player team total. */
export function telemetryTeamKills(players: TelemetryPlayer[]): number | null {
  return players.length === 5 && new Set(players.map(player => player.playerId)).size === 5
    && players.every(player => player.stats.kills.availability === 'available' && player.stats.kills.value !== null)
    ? players.reduce((sum, player) => sum + player.stats.kills.value!, 0) : null;
}

/** Actual ORDER/CHAOS sides follow confirmed player identities, independently of BP colors. */
export function telemetryTeam(state: Pick<MatchState, 'blueTeam' | 'redTeam' | 'blueScore' | 'redScore'>, players: TelemetryPlayer[]) {
  if (!players.length) return;
  const sides = (['blue', 'red'] as const).filter(side => {
    const team = state[`${side}Team`];
    const ids = team.playerIds ?? team.players.map((_, index) => `${team.id}-p${index + 1}`);
    return players.every(player => ids.includes(player.playerId));
  });
  if (sides.length !== 1) return;
  const side = sides[0];
  return { side, team: state[`${side}Team`], score: state[`${side}Score`] };
}

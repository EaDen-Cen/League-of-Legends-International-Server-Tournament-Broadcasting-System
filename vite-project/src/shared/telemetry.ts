export type TelemetryField = 'gameTime' | 'kills' | 'deaths' | 'assists' | 'level' | 'cs' | 'totalGold' | 'damageDealt' | 'damageTaken' | 'healing';
export interface TelemetryMetric {
  value: number | null;
  availability: 'available' | 'unknown' | 'unsupported' | 'not-applicable';
  source: 'live-client' | 'manual' | 'unavailable';
  updatedAt: number | null;
  frozen: boolean;
  stale: boolean;
}
export interface TelemetryPlayer {
  /** Stable tournament identity only when explicitly matched by Riot ID; otherwise API identity. */
  playerId: string;
  riotId: string;
  team: 'ORDER' | 'CHAOS';
  championId: number | null;
  championName: string;
  stats: Record<Exclude<TelemetryField, 'gameTime'>, TelemetryMetric>;
}
export type TelemetryRosterPlayer = Pick<TelemetryPlayer, 'playerId' | 'riotId' | 'team' | 'championId' | 'championName'>;
export interface TelemetrySample {
  gameTime: TelemetryMetric;
  gameMode: string;
  mapName: string;
  players: TelemetryPlayer[];
  events: Array<{ id: number; name: string; time: number | null }>;
  /** No Summoner's Rift neutral-objective panel is inferred for ARAM. */
  neutralObjectives: 'not-applicable' | 'unsupported';
  endedHint: boolean;
}
export interface TelemetrySnapshot {
  gameId: string;
  matchId?: string;
  status: 'waiting' | 'pending' | 'live' | 'stale' | 'disconnected';
  sessionId?: string;
  pending?: { fingerprint: string; instanceId: string; sample: TelemetrySample };
  sample?: TelemetrySample;
  lastReceivedAt?: number;
  lastError?: string;
  endedHint: boolean;
  unmatchedManualPlayerIds?: string[];
}
export interface TelemetryPacket {
  matchId: string;
  gameId: string;
  sessionId: string;
  instanceId: string;
  sequence: number;
  capturedAt: number;
  data: unknown;
}

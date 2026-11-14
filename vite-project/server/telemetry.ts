import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import heroes from '../src/components/HeroList.js';
import type { TelemetryField, TelemetryMetric, TelemetryPacket, TelemetryRosterPlayer, TelemetrySample, TelemetrySnapshot } from '../src/shared/telemetry.js';

const fields: TelemetryField[] = ['gameTime', 'kills', 'deaths', 'assists', 'level', 'cs', 'totalGold', 'damageDealt', 'damageTaken', 'healing'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const copy = <T>(value: T): T => structuredClone(value);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value);
const key = (playerId: string | undefined, field: TelemetryField) => JSON.stringify([playerId ?? null, field]);
const normalizeName = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const championNames = new Map(heroes.flatMap(hero => [hero.englishName, hero.chineseName, hero.imageLink.split('/').pop()?.replace(/\.png$/, '') ?? '']
  .filter(Boolean).map(name => [normalizeName(name), hero.id] as const)));

function metric(value: unknown, at: number, unsupported = false): TelemetryMetric {
  const valid = number(value);
  return { value: valid, availability: valid !== null ? 'available' : unsupported ? 'unsupported' : 'unknown',
    source: valid === null ? 'unavailable' : 'live-client', updatedAt: valid === null ? null : at, frozen: false, stale: false };
}

/** Parse only documented Live Client fields; missing statistics remain unknown. */
export function parseLiveClient(data: unknown, at: number): TelemetrySample {
  const raw = object(data);
  const game = object(raw.gameData);
  if (!Array.isArray(raw.allPlayers) || raw.allPlayers.length < 1 || raw.allPlayers.length > 10 || number(game.gameTime) === null)
    throw new Error('Invalid Live Client allgamedata response');
  const players = raw.allPlayers.map(value => {
    const player = object(value);
    const riotId = text(player.riotId) || [text(player.riotIdGameName), text(player.riotIdTagLine)].filter(Boolean).join('#') || text(player.summonerName);
    if (!riotId || !['ORDER', 'CHAOS'].includes(String(player.team))) throw new Error('Live Client player identity/team missing');
    const scores = object(player.scores);
    const championName = text(player.championName);
    const rawName = text(player.rawChampionName).replace(/^game_character_displayname_/, '');
    const championId = championNames.get(normalizeName(rawName)) ?? championNames.get(normalizeName(championName)) ?? null;
    return { playerId: riotId, riotId, team: player.team as 'ORDER' | 'CHAOS', championId, championName,
      stats: { kills: metric(scores.kills, at), deaths: metric(scores.deaths, at), assists: metric(scores.assists, at),
        level: metric(player.level, at), cs: metric(scores.creepScore, at), totalGold: metric(undefined, at, true),
        damageDealt: metric(undefined, at, true), damageTaken: metric(undefined, at, true), healing: metric(undefined, at, true) } };
  });
  if (new Set(players.map(player => player.playerId)).size !== players.length) throw new Error('Duplicate Live Client player identity');
  const events = object(raw.events).Events;
  if (events !== undefined && (!Array.isArray(events) || events.length > 10000)) throw new Error('Invalid Live Client events');
  const parsedEvents = (Array.isArray(events) ? events : []).map(value => {
    const event = object(value);
    if (!Number.isInteger(event.EventID) || Number(event.EventID) < 0 || !text(event.EventName, 100)) throw new Error('Invalid Live Client event');
    return { id: Number(event.EventID), name: text(event.EventName, 100), time: number(event.EventTime) };
  });
  const gameMode = text(game.gameMode, 100);
  const mapName = text(game.mapName, 100);
  return { gameTime: metric(game.gameTime, at), gameMode, mapName, players, events: parsedEvents,
    neutralObjectives: gameMode.toUpperCase().includes('ARAM') || game.mapNumber === 12 ? 'not-applicable' : 'unsupported',
    endedHint: parsedEvents.some(event => event.name === 'GameEnd') };
}

function fingerprint(sample: TelemetrySample) {
  return hash(JSON.stringify([sample.gameMode, sample.mapName, sample.players.map(player => [player.playerId, player.team, player.championId, player.championName]).sort()]));
}
interface Session { id: string; tokenHash: string; instanceId?: string; fingerprint?: string; sequence: number; gameTime?: number }
interface Pending { fingerprint: string; instanceId: string; sample: TelemetrySample; raw: unknown; sequence: number; capturedAt: number }
interface RecordData {
  matchId: string; gameId: string; session?: Session; pending?: Pending; sample?: TelemetrySample; raw?: unknown;
  roster?: TelemetryRosterPlayer[];
  lastReceivedAt?: number; lastError?: string;
  manual: Record<string, { playerId?: string; field: TelemetryField; value: number | null; at: number }>;
  audit: Array<{ at: number; actor: string; action: string; detail: unknown }>;
}
interface Data { version: 1; records: Record<string, RecordData> }

/** Telemetry has its own durable state and never holds a BP Store reference. */
export class TelemetryStore {
  private data: Data;
  constructor(private file?: string, private clock = Date.now) {
    this.data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Data : { version: 1, records: {} };
    if (this.data.version !== 1 || !this.data.records || Array.isArray(this.data.records)) throw new Error('Invalid telemetry archive');
    // Restart requires a fresh director-approved binding; old upload credentials cannot revive it.
    for (const record of Object.values(this.data.records)) {
      delete record.session; delete record.pending;
      record.lastError = 'Server restarted; create and confirm a new collection session';
    }
    if (file && existsSync(file)) this.save(this.data);
  }

  private save(next: Data) {
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        const fd = openSync(temporary, 'wx');
        try { writeFileSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(temporary, this.file);
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    this.data = next;
  }
  private record(next: Data, gameId: string) {
    if (!id(gameId) || !next.records[gameId]) throw new Error('Telemetry game not found');
    return next.records[gameId];
  }
  private audit(record: RecordData, actor: string, action: string, detail: unknown) {
    record.audit.push({ at: this.clock(), actor: text(actor, 200) || 'control', action, detail });
  }

  initializeManual(matchId: string, gameId: string, roster: TelemetryRosterPlayer[], actor = 'control') {
    if (!id(matchId) || !id(gameId) || !Array.isArray(roster) || roster.length > 10
      || roster.some(player => !text(player.playerId) || typeof player.riotId !== 'string' || player.riotId.length > 200 || !['ORDER', 'CHAOS'].includes(player.team)
        || (player.championId !== null && !heroes.some(hero => hero.id === player.championId)) || typeof player.championName !== 'string' || player.championName.length > 200)
      || new Set(roster.map(player => player.playerId)).size !== roster.length) throw new Error('Invalid manual telemetry roster');
    // BP champions are not evidence of actual champions, and do not affect identity matching.
    const expected = roster.map(player => ({ playerId: player.playerId, riotId: player.riotId, team: player.team, championId: null, championName: '' }));
    const existing = this.data.records[gameId];
    if (existing) {
      if (existing.matchId !== matchId) throw new Error('Telemetry game belongs to another match');
      // A confirmed room keeps its identity mapping until a new collection session is opened.
      if (existing.session?.instanceId || JSON.stringify(existing.roster) === JSON.stringify(expected)) return;
    }
    const next = copy(this.data);
    const unknown = () => metric(undefined, this.clock());
    const record: RecordData = next.records[gameId] ?? { matchId, gameId, manual: {}, audit: [] };
    const before = record.roster;
    record.roster = expected;
    if (record.raw === undefined) record.sample = { gameTime: unknown(), gameMode: '', mapName: '', neutralObjectives: 'unsupported', events: [], endedHint: false,
      players: expected.map(player => ({ ...player, stats: { kills: unknown(), deaths: unknown(), assists: unknown(), level: unknown(), cs: unknown(),
        totalGold: unknown(), damageDealt: unknown(), damageTaken: unknown(), healing: unknown() } })) };
    if (record.pending) {
      record.pending.sample = parseLiveClient(record.pending.raw, record.pending.capturedAt);
      this.mapRoster(record, record.pending.sample);
    }
    next.records[gameId] = record;
    this.audit(record, actor, existing ? 'refresh-manual-roster' : 'initialize-manual-roster', { before, after: expected });
    this.save(next);
  }

  private mapRoster(record: RecordData, sample: TelemetrySample) {
    for (const player of sample.players) {
      const matches = record.roster?.filter(candidate => candidate.team === player.team
        && candidate.riotId.normalize('NFKC').toLowerCase() === player.riotId.normalize('NFKC').toLowerCase()) ?? [];
      if (matches.length === 1) player.playerId = matches[0].playerId;
    }
  }

  begin(matchId: string, gameId: string, actor = 'control') {
    if (!id(matchId) || !id(gameId)) throw new Error('Invalid match/game ID');
    const next = copy(this.data);
    const record = next.records[gameId] ??= { matchId, gameId, manual: {}, audit: [] };
    if (record.matchId !== matchId) throw new Error('Telemetry game belongs to another match');
    const token = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    record.session = { id: sessionId, tokenHash: hash(token), sequence: -1 };
    delete record.pending; delete record.lastError;
    this.audit(record, actor, 'begin-session', { sessionId });
    this.save(next);
    return { sessionId, token };
  }

  ingest(token: string, input: unknown, current: { matchId: string; gameId: string }) {
    const packet = object(input) as unknown as TelemetryPacket;
    if (!id(packet.gameId) || !id(packet.matchId) || !id(packet.sessionId) || !id(packet.instanceId)
      || !Number.isSafeInteger(packet.sequence) || packet.sequence < 0 || number(packet.capturedAt) === null
      || Math.abs(this.clock() - packet.capturedAt) > 30000) throw new Error('Invalid or expired telemetry packet');
    if (packet.matchId !== current.matchId || packet.gameId !== current.gameId) throw new Error('Telemetry packet targets a different game');
    const next = copy(this.data);
    const record = this.record(next, packet.gameId);
    const session = record.session;
    if (!session || record.matchId !== packet.matchId || session.id !== packet.sessionId || typeof token !== 'string'
      || !timingSafeEqual(Buffer.from(hash(token)), Buffer.from(session.tokenHash))) throw new Error('Telemetry session revoked or invalid');
    if (packet.sequence <= session.sequence) throw new Error('Duplicate or out-of-order telemetry sample');
    const sample = parseLiveClient(packet.data, packet.capturedAt);
    const room = fingerprint(sample);
    this.mapRoster(record, sample);
    if (session.instanceId && (session.instanceId !== packet.instanceId || session.fingerprint !== room
      || sample.gameTime.value! < (session.gameTime ?? 0))) {
      delete record.session; delete record.pending;
      record.lastError = 'Game connection, roster or clock changed; director must create and confirm a new session';
      this.audit(record, 'bridge', 'binding-rejected', { sessionId: session.id });
      this.save(next);
      throw new Error(record.lastError);
    }
    session.sequence = packet.sequence;
    if (!session.instanceId) {
      record.pending = { fingerprint: room, instanceId: packet.instanceId, sample, raw: copy(packet.data), sequence: packet.sequence, capturedAt: packet.capturedAt };
      this.save(next);
      return { accepted: false, pending: true };
    }
    session.gameTime = sample.gameTime.value!;
    record.sample = sample; record.raw = copy(packet.data); record.lastReceivedAt = this.clock(); delete record.lastError;
    this.save(next);
    return { accepted: true, pending: false };
  }

  confirm(gameId: string, sessionId: string, roomFingerprint: string, actor = 'control') {
    const next = copy(this.data);
    const record = this.record(next, gameId);
    const pending = record.pending;
    if (!record.session || record.session.id !== sessionId || !pending || pending.fingerprint !== roomFingerprint)
      throw new Error('Collection preview changed; review the latest roster');
    if (this.clock() - pending.capturedAt > 30000) throw new Error('Collection preview expired; wait for a fresh sample');
    record.session.instanceId = pending.instanceId;
    record.session.fingerprint = pending.fingerprint;
    record.session.gameTime = pending.sample.gameTime.value!;
    record.sample = pending.sample; record.raw = pending.raw; record.lastReceivedAt = this.clock();
    delete record.pending;
    this.audit(record, actor, 'confirm-room', { sessionId, fingerprint: roomFingerprint });
    this.save(next);
  }

  end(gameId: string, actor = 'control') {
    const next = copy(this.data); const record = this.record(next, gameId);
    delete record.session; delete record.pending;
    this.audit(record, actor, 'end-session', {}); this.save(next);
  }

  manual(gameId: string, change: { playerId?: string; field: TelemetryField; value: number | null }, actor = 'control') {
    if (!change || !fields.includes(change.field) || (change.value !== null && number(change.value) === null)
      || (change.field === 'gameTime' ? change.playerId !== undefined : !text(change.playerId))) throw new Error('Invalid manual telemetry value');
    const next = copy(this.data); const record = this.record(next, gameId);
    if (change.field !== 'gameTime' && !record.sample?.players.some(player => player.playerId === change.playerId)) throw new Error('Telemetry player not found');
    const entryKey = key(change.playerId, change.field);
    const before = record.manual[entryKey] ?? null;
    record.manual[entryKey] = { ...change, at: this.clock() };
    this.audit(record, actor, 'manual-freeze', { before, after: change }); this.save(next);
  }

  resume(gameId: string, playerId: string | undefined, field: TelemetryField, actor = 'control') {
    if (!fields.includes(field) || (field === 'gameTime' ? playerId !== undefined : !text(playerId))) throw new Error('Invalid telemetry field');
    const next = copy(this.data); const record = this.record(next, gameId);
    const entryKey = key(playerId, field); const before = record.manual[entryKey] ?? null;
    delete record.manual[entryKey]; this.audit(record, actor, 'resume-auto', { playerId, field, before }); this.save(next);
  }

  snapshot(gameId: string): TelemetrySnapshot {
    const record = this.data.records[gameId];
    if (!record) return { gameId, status: 'waiting', endedHint: false };
    const sample = record.sample ? copy(record.sample) : undefined;
    const stale = record.lastReceivedAt === undefined || this.clock() - record.lastReceivedAt > 5000 || !record.session?.instanceId;
    if (sample) {
      for (const metric of [sample.gameTime, ...sample.players.flatMap(player => Object.values(player.stats))]) metric.stale = stale && metric.value !== null;
      for (const change of Object.values(record.manual)) {
        const target = change.field === 'gameTime' ? sample.gameTime : sample.players.find(player => player.playerId === change.playerId)?.stats[change.field];
        if (target) Object.assign(target, { value: change.value, availability: change.value === null ? 'unknown' : 'available',
          source: 'manual', updatedAt: change.at, frozen: true, stale: false });
      }
    }
    const unmatchedManualPlayerIds = [...new Set(Object.values(record.manual).map(change => change.playerId)
      .filter((playerId): playerId is string => !!playerId && !sample?.players.some(player => player.playerId === playerId)))];
    return { gameId, matchId: record.matchId, status: record.pending ? 'pending' : !record.session ? record.lastReceivedAt === undefined ? 'waiting' : 'disconnected'
      : !record.session.instanceId ? 'waiting' : stale ? 'stale' : 'live',
    sessionId: record.session?.id, pending: record.pending ? { fingerprint: record.pending.fingerprint, instanceId: record.pending.instanceId, sample: copy(record.pending.sample) } : undefined,
    sample, lastReceivedAt: record.lastReceivedAt, lastError: record.lastError, endedHint: sample?.endedHint ?? false, unmatchedManualPlayerIds };
  }

  export(gameId: string) {
    const record = this.record(this.data, gameId);
    return { version: 1, ...this.snapshot(gameId), rawLastTrustedSample: copy(record.raw), manual: copy(record.manual), audit: copy(record.audit) };
  }
}

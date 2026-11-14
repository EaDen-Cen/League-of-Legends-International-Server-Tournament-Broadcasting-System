import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseLiveClient, TelemetryStore } from './telemetry.js';

const raw = (time = 60, kills?: number, ended = false) => ({
  gameData: { gameTime: time, gameMode: 'ARAM', mapName: 'Map12', mapNumber: 12 },
  activePlayer: { currentGold: 9999 },
  allPlayers: [
    { riotId: 'Blue#1', team: 'ORDER', championName: '安妮', rawChampionName: 'game_character_displayname_Annie', level: 5,
      scores: { kills, deaths: 0, assists: 2, creepScore: 10 } },
    { riotId: 'Red#1', team: 'CHAOS', championName: 'Olaf', level: 4, scores: { kills: 0, deaths: 1, assists: 0, creepScore: 4 } },
  ],
  events: { Events: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }, ...(ended ? [{ EventID: 1, EventName: 'GameEnd', EventTime: time }] : [])] },
});

test('Live Client parsing keeps unknown, true zero and unsupported separate; currentGold is never total gold', () => {
  const sample = parseLiveClient(raw(), 1000);
  assert.equal(sample.players[0].championId, 1);
  assert.equal(sample.players[0].stats.kills.value, null);
  assert.equal(sample.players[0].stats.kills.availability, 'unknown');
  assert.equal(sample.players[0].stats.deaths.value, 0);
  assert.equal(sample.players[0].stats.totalGold.value, null);
  assert.equal(sample.players[0].stats.totalGold.availability, 'unsupported');
  assert.equal(sample.neutralObjectives, 'not-applicable');
  assert.throws(() => parseLiveClient({ allPlayers: [] }, 1), /Invalid/);
});

test('without a game, director can enter statistics on stable players without inventing actual champions or a live connection', () => {
  const now = 100000; const store = new TelemetryStore(undefined, () => now);
  const binding = { matchId: 'match-1', gameId: 'game-1' };
  store.initializeManual(binding.matchId, binding.gameId, [
    { playerId: 'player-1', riotId: 'Blue#1', team: 'ORDER', championId: 1, championName: 'Annie' },
    { playerId: 'player-2', riotId: '', team: 'CHAOS', championId: null, championName: '' },
  ]);
  let snapshot = store.snapshot(binding.gameId);
  assert.equal(snapshot.status, 'waiting'); assert.equal(snapshot.lastReceivedAt, undefined);
  assert.equal(snapshot.sample?.players[0].championId, null);
  assert.equal(snapshot.sample?.players[0].stats.kills.source, 'unavailable');
  store.manual(binding.gameId, { playerId: 'player-1', field: 'damageDealt', value: 123 });
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].stats.damageDealt.value, 123);
  const session = store.begin(binding.matchId, binding.gameId);
  assert.equal(store.snapshot(binding.gameId).status, 'waiting');
  store.ingest(session.token, { ...binding, sessionId: session.sessionId, instanceId: 'instance-1', sequence: 1, capturedAt: now, data: raw(60, 2) }, binding);
  store.confirm(binding.gameId, session.sessionId, store.snapshot(binding.gameId).pending!.fingerprint);
  snapshot = store.snapshot(binding.gameId);
  assert.equal(snapshot.sample?.players[0].playerId, 'player-1');
  assert.equal(snapshot.sample?.players[0].championId, 1);
  assert.equal(snapshot.sample?.players[0].stats.damageDealt.value, 123);
  assert.equal(snapshot.sample?.players[0].stats.kills.value, 2);
});

test('expected roster refreshes before binding without resetting stable-player manual values or dropping replaced-player evidence', () => {
  const store = new TelemetryStore(undefined, () => 100000);
  const roster = [{ playerId: 'player-1', riotId: 'P1', team: 'ORDER' as const, championId: null, championName: '' }];
  store.initializeManual('match-1', 'game-1', roster);
  store.manual('game-1', { playerId: 'player-1', field: 'kills', value: 7 });
  const configured = [{ ...roster[0], riotId: 'Blue#1' }];
  store.initializeManual('match-1', 'game-1', configured);
  let view = store.snapshot('game-1');
  assert.equal(view.sample?.players[0].riotId, 'Blue#1');
  assert.equal(view.sample?.players[0].stats.kills.value, 7);
  assert.equal(view.sample?.players[0].stats.kills.source, 'manual');
  assert.equal(view.sample?.players[0].stats.deaths.source, 'unavailable');
  assert.equal(view.status, 'waiting'); assert.equal(view.lastReceivedAt, undefined);
  const auditCount = store.export('game-1').audit.length;
  store.initializeManual('match-1', 'game-1', configured);
  assert.equal(store.export('game-1').audit.length, auditCount, 'unchanged GET initialization must not persist another operation');
  const other = { ...configured[0], playerId: 'player-2', riotId: 'Red#1', team: 'CHAOS' as const };
  store.initializeManual('match-1', 'game-1', [other, ...configured]);
  assert.equal(store.snapshot('game-1').sample?.players[1].playerId, 'player-1');
  assert.equal(store.snapshot('game-1').sample?.players[1].stats.kills.value, 7, 'reordering must keep the correction on the stable player');
  store.initializeManual('match-1', 'game-1', [{ ...configured[0], playerId: 'replacement-1' }]);
  view = store.snapshot('game-1');
  assert.equal(view.sample?.players[0].playerId, 'replacement-1');
  assert.equal(view.sample?.players[0].stats.kills.value, null);
  assert.deepEqual(view.unmatchedManualPlayerIds, ['player-1']);
  assert.ok(Object.values(store.export('game-1').manual).some(change => change.playerId === 'player-1' && change.value === 7));
  assert.ok(store.export('game-1').audit.some(event => event.action === 'refresh-manual-roster'));
});

test('pending previews use refreshed stable identities while confirmed evidence and mappings stay locked until a new session', () => {
  const now = 100000; const store = new TelemetryStore(undefined, () => now);
  const binding = { matchId: 'match-1', gameId: 'game-1' };
  const initial = [{ playerId: 'player-1', riotId: 'P1', team: 'ORDER' as const, championId: null, championName: '' }];
  store.initializeManual(binding.matchId, binding.gameId, initial);
  const session = store.begin(binding.matchId, binding.gameId);
  store.ingest(session.token, { ...binding, sessionId: session.sessionId, instanceId: 'instance-1', sequence: 1, capturedAt: now, data: raw(60, 2) }, binding);
  store.initializeManual(binding.matchId, binding.gameId, [{ ...initial[0], riotId: 'Blue#1' }]);
  const preview = store.snapshot(binding.gameId).pending!;
  assert.equal(preview.sample.players[0].playerId, 'player-1');
  store.confirm(binding.gameId, session.sessionId, preview.fingerprint);
  const trusted = store.export(binding.gameId);
  store.initializeManual(binding.matchId, binding.gameId, [{ ...initial[0], playerId: 'replacement-1', riotId: 'Changed#1' }]);
  assert.deepEqual(store.export(binding.gameId), trusted, 'BP edits cannot rewrite trusted actual players or source evidence');
  store.begin(binding.matchId, binding.gameId);
  store.initializeManual(binding.matchId, binding.gameId, [{ ...initial[0], playerId: 'replacement-1', riotId: 'Changed#1' }]);
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].playerId, 'player-1');
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].riotId, 'Blue#1');
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].stats.kills.value, 2);
  assert.deepEqual(store.export(binding.gameId).rawLastTrustedSample, trusted.rawLastTrustedSample);
  assert.equal(store.snapshot(binding.gameId).status, 'waiting');
});

test('first room requires director confirmation, stale/error packets cannot cross game or session; metrics never alter BP', () => {
  let now = 100000; const store = new TelemetryStore(undefined, () => now);
  const binding = { matchId: 'match-1', gameId: 'game-1' };
  const session = store.begin(binding.matchId, binding.gameId);
  const packet = (sequence: number, data = raw(60, 1), instanceId = 'instance-1') => ({ ...binding, sessionId: session.sessionId, instanceId, sequence, capturedAt: now, data });
  assert.throws(() => store.ingest('wrong', packet(0), binding), /invalid/);
  assert.deepEqual(store.ingest(session.token, packet(0), binding), { accepted: false, pending: true });
  assert.equal(store.snapshot(binding.gameId).sample, undefined);
  let view = store.snapshot(binding.gameId); assert.ok(view.pending);
  assert.throws(() => store.confirm(binding.gameId, session.sessionId, 'wrong'), /changed/);
  store.confirm(binding.gameId, session.sessionId, view.pending.fingerprint);
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].stats.kills.value, 1);
  assert.throws(() => store.ingest(session.token, packet(0), binding), /Duplicate/);
  assert.throws(() => store.ingest(session.token, packet(1), { ...binding, gameId: 'game-2' }), /different game/);
  store.manual(binding.gameId, { playerId: 'Blue#1', field: 'kills', value: 9 }, 'director');
  now += 1000; store.ingest(session.token, packet(1, raw(61, 2, true)), binding);
  view = store.snapshot(binding.gameId);
  assert.equal(view.sample?.players[0].stats.kills.value, 9);
  assert.equal(view.sample?.players[0].stats.kills.source, 'manual');
  assert.equal(view.endedHint, true);
  store.resume(binding.gameId, 'Blue#1', 'kills');
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].stats.kills.value, 2);
  now += 6000; assert.equal(store.snapshot(binding.gameId).status, 'stale');
  assert.equal(store.snapshot(binding.gameId).sample?.players[0].stats.deaths.stale, true);
  assert.throws(() => store.ingest(session.token, packet(2, raw(5, 0), 'instance-2'), binding), /changed/);
  assert.equal(store.snapshot(binding.gameId).status, 'disconnected');
  assert.equal(store.snapshot(binding.gameId).sample?.gameTime.value, 61);
  assert.throws(() => store.ingest(session.token, packet(3), binding), /revoked/);
  const exported = JSON.stringify(store.export(binding.gameId));
  assert.ok(exported.includes('rawLastTrustedSample'));
  assert.ok(!exported.includes(session.token)); assert.ok(!exported.includes('tokenHash'));
});

test('restarting preserves per-game raw evidence/manual corrections and revokes upload credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lol-telemetry-'));
  try {
    const file = join(directory, 'telemetry.json'); const now = 100000;
    const store = new TelemetryStore(file, () => now);
    const binding = { matchId: 'match-1', gameId: 'game-1' };
    const session = store.begin(binding.matchId, binding.gameId);
    const packet = { ...binding, sessionId: session.sessionId, instanceId: 'instance-1', sequence: 1, capturedAt: now, data: raw(60, 3) };
    store.ingest(session.token, packet, binding);
    store.confirm(binding.gameId, session.sessionId, store.snapshot(binding.gameId).pending!.fingerprint);
    store.manual(binding.gameId, { playerId: 'Blue#1', field: 'damageDealt', value: 1234 });
    assert.ok(!readFileSync(file, 'utf8').includes(session.token));
    const restored = new TelemetryStore(file, () => now);
    assert.equal(restored.snapshot(binding.gameId).status, 'disconnected');
    assert.equal(restored.snapshot(binding.gameId).sample?.players[0].stats.damageDealt.value, 1234);
    assert.throws(() => restored.ingest(session.token, { ...packet, sequence: 2 }, binding), /revoked/);
    assert.equal(restored.snapshot('game-2').status, 'waiting');
  } finally { rmSync(directory, { recursive: true }); }
});

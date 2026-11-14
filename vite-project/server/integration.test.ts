import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { initialState } from '../src/shared/types.js';
import type { Snapshot } from '../src/shared/types.js';
import heroes from '../src/components/HeroList.js';
import { draftPhases, legacyGameRules } from '../src/shared/gameRules.js';

test('HTTP/WS auth, uploads, team library, captain isolation, rotation and director priority', { timeout: 20000 }, async () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/server.ts'], {
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), DATA_FILE: join(mkdtempSync(join(tmpdir(), 'lol-api-')), 'match.json'), CONTROL_TOKEN: 'test-control', CASTER_TOKEN: 'test-caster', OVERLAY_TOKEN: 'test-overlay' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sockets: WebSocket[] = [];
  const base = `http://127.0.0.1:${port}`;
  const connect = (token: string) => new Promise<{ ws: WebSocket; messages: Record<string, unknown>[] }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: Record<string, unknown>[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('error', reject);
    ws.on('message', raw => { const m = JSON.parse(raw.toString()); messages.push(m); if (m.type === 'match_state_update') resolve({ ws, messages }); });
  });
  const wait = async (fn: () => boolean) => { for (let n = 0; n < 100; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 30)); } throw new Error('Timed out'); };
  try {
    await new Promise<void>((resolve, reject) => { proc.stdout!.on('data', chunk => { if (String(chunk).includes('ready')) resolve(); }); proc.once('exit', code => reject(new Error(`Server exited ${code}`))); proc.once('error', reject); });
    assert.equal((await fetch(base + '/api/match')).status, 401);
    const portrait = readFileSync('e2e/fixtures/player-test.png');
    const upload = (token: string, body: Buffer, mime = 'image/png', filename = 'portrait.png') => fetch(base + '/api/uploads/player-portrait', {method:'POST',headers:{Authorization:'Bearer ' + token,'Content-Type':mime,'X-File-Name':encodeURIComponent(filename)},body});
    for (const token of ['test-caster','test-overlay','invalid']) assert.equal((await upload(token,portrait)).status,token === 'test-overlay' ? 403 : 401);
    assert.equal((await upload('test-control', Buffer.alloc(5*1024*1024+1))).status,413);
    assert.equal((await upload('test-control', Buffer.from('<svg/>'),'image/svg+xml','x.svg')).status,415);
    assert.equal((await upload('test-control', Buffer.from('<html/>'),'text/html','x.html')).status,415);
    assert.equal((await upload('test-control', Buffer.from('<svg/>'),'image/png','fake.png')).status,415);
    assert.equal((await upload('test-control', portrait,'image/png','fake.jpg')).status,415);
    assert.equal((await upload('test-control', portrait.subarray(0,30))).status,415);
    const uploaded = await upload('test-control',portrait,'image/png','../../outside.png');
    assert.equal(uploaded.status,201);
    const asset = (await uploaded.json()) as {url:string};
    assert.match(asset.url,/^\/uploads\/player-portraits\/[0-9a-f-]{36}\.png$/);
    const image = await fetch(base+asset.url);
    assert.equal(image.status,200); assert.equal(image.headers.get('content-type'),'image/png');
    assert.equal(image.headers.get('x-content-type-options'),'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()),portrait);
    assert.equal((await fetch(base+'/uploads/player-portraits/%2e%2e%2fmatch.json')).status,404);
    assert.equal((await fetch(base+asset.url,{method:'DELETE',headers:{Authorization:'Bearer test-control'}})).status,405);

    const presetAPI = (token:string,method='GET',path='',body?:unknown) => fetch(base+'/api/team-presets'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined});
    for (const token of ['test-caster','test-overlay','invalid']) for (const method of ['GET','POST','PUT','DELETE']) assert.equal((await presetAPI(token,method,method === 'PUT' || method === 'DELETE' ? '/missing' : '')).status,token === 'test-overlay' ? 403 : 401);
    const created = await presetAPI('test-control','POST','',{...initialState().blueTeam,name:'Library Test'});
    assert.equal(created.status,201);const saved = await created.json() as {id:string};
    assert.equal((await presetAPI('test-control','PUT','/'+saved.id,{...initialState().blueTeam,name:'Renamed'})).status,200);
    assert.equal((await (await presetAPI('test-control')).json() as {teams:{name:string}[]}).teams[0].name,'Renamed');
    assert.equal((await presetAPI('test-control','POST','',{name:'invalid'})).status,400);
    assert.equal((await presetAPI('test-control','DELETE','/'+saved.id)).status,200);
    assert.deepEqual((await (await presetAPI('test-control')).json() as {teams:unknown[]}).teams,[]);

    const api = async (path: string, input: unknown, token = 'test-control', method = 'POST') => {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw Error(JSON.stringify(data));
      return data;
    };
    const control = await connect('test-control'), overlay = await connect('test-overlay');
    const latest = (c = control) => c.messages.filter(m => m.type === 'match_state_update').at(-1) as unknown as Snapshot;
    const act = async (action: unknown) => {
      const snapshot = latest(); const id = randomUUID();
      control.ws.send(JSON.stringify({ type: 'action', id, revision: snapshot.revision, action }));
      await wait(() => control.messages.some(m => m.id === id));
      assert.ok(control.messages.some(m => m.id === id && m.type === 'ack'), JSON.stringify(control.messages.at(-1)));
    };
    const state = latest().state;
    const invite = async (teamId: string) => {
      const matchId = latest().state.matchId;
      const result = await api('/api/captains', { matchId, teamId, operation: 'rotate' });
      await api('/api/captains', { matchId, teamId, operation: 'enable' });
      return (result as {token:string}).token;
    };
    const aToken = await invite(state.blueTeam.id), bToken = await invite(state.redTeam.id);
    const a = await connect(aToken), b = await connect(bToken);
    assert.equal(a.messages[0].captains, undefined);
    assert.equal(JSON.stringify(overlay.messages).includes(aToken), false);
    assert.equal(JSON.stringify(a.messages).includes(bToken), false);
    assert.equal((await fetch(base + '/api/captains', { headers: { Authorization: `Bearer ${aToken}` } })).status, 403);
    assert.equal((await fetch(base + '/api/match', { headers: { Authorization: 'Bearer test-caster' } })).status, 401);
    assert.equal((await fetch(base + '/caster')).status, 410);
    for (const path of ['/api/capture', '/api/capture-lineup', '/api/recognize-frame']) {
      assert.notEqual((await fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer test-control' } })).status, 200);
    }
    const sendCaptain = (client: typeof a, action: unknown, overrides: object = {}) => {
      const snapshot = latest(client) as Snapshot & { captain: { epoch: number } };
      const id = randomUUID();
      client.ws.send(JSON.stringify({ type: 'action', id, revision: snapshot.revision, matchId: snapshot.state.matchId, gameId: snapshot.state.gameId, stepId: `step-${snapshot.state.currentPhase}`, epoch: snapshot.captain.epoch, action, ...overrides }));
      return id;
    };
    const rejected = async (client: typeof a, action: unknown, overrides: object = {}) => {
      const id = sendCaptain(client, action, overrides);
      await wait(() => client.messages.some(m => m.id === id));
      assert.ok(client.messages.some(m => m.id === id && m.type === 'error'));
    };
    await rejected(a, { type: 'draft_action', team: 'red', action: 'ban', heroId: 64 });
    await rejected(a, { type: 'score', team: 'blue', delta: 1 });
    await rejected(a, { type: 'reset_match', role: 'control' });
    await rejected(a, { type: 'draft_action', team: 'blue', action: 'ban', heroId: 64 }, { gameId: 'future-game' });
    await rejected(a, { type: 'draft_action', team: 'blue', action: 'ban', heroId: 64 }, { epoch: -1 });
    const id = sendCaptain(a, { type: 'draft_action', team: 'blue', action: 'ban', heroId: 64 });
    await wait(() => a.messages.some(m => m.id === id && m.type === 'ack'));
    await wait(() => latest(overlay).revision === 1 && latest(b).revision === 1);
    assert.deepEqual(latest(overlay).state.blueBans, [64]);
    await rejected(a, { type: 'draft_action', team: 'blue', action: 'ban', heroId: 1 });
    // An old captain request arrives after a director replacement and must not overwrite it.
    const old = latest(b) as Snapshot & { captain: { epoch: number } };
    await act({ type: 'correct_slot', gameId: state.gameId, slotId: 'step-0-slot-0', heroId: 1, reason: 'Correct mistaken ban' });
    await rejected(b, { type: 'draft_action', team: 'red', action: 'ban', heroId: 2 }, { revision: old.revision, epoch: old.captain.epoch });
    assert.deepEqual(latest().state.blueBans, [1]);
    await api('/api/captains', { matchId: state.matchId, teamId: state.blueTeam.id, operation: 'rotate' });
    await wait(() => a.ws.readyState !== WebSocket.OPEN);
    assert.equal((await fetch(base + '/api/match', { headers: { Authorization: `Bearer ${aToken}` } })).status, 401);
    await act({ type: 'undo' });
    assert.equal((await fetch(base + '/api/match', { headers: { Authorization: `Bearer ${aToken}` } })).status, 401);
    overlay.ws.close(); const reconnected = await connect('test-overlay');
    assert.equal(latest(reconnected).revision, latest().revision);
    const readOnlyId = randomUUID();
    reconnected.ws.send(JSON.stringify({ type: 'action', id: readOnlyId, revision: latest().revision, action: { type: 'reset_match' } }));
    await wait(() => reconnected.messages.some(m => m.id === readOnlyId && m.type === 'error'));
    // Four live views complete a zero-ban draft with grouped picks and duplicate network retries.
    await act({ type: 'reset_match' });
    await act({ type: 'current_rules', rules: { ...legacyGameRules(latest().state), stages: [
      { team: 'blue', action: 'pick', count: 1 }, { team: 'red', action: 'pick', count: 2 },
      { team: 'blue', action: 'pick', count: 2 }, { team: 'red', action: 'pick', count: 2 },
      { team: 'blue', action: 'pick', count: 2 }, { team: 'red', action: 'pick', count: 1 },
    ] } });
    await act({ type: 'pause_draft', paused: false });
    const captainA = await connect(await invite(latest().state.blueTeam.id));
    const captainB = await connect(await invite(latest().state.redTeam.id));
    let heroIndex = 0;
    while (!latest().state.draftComplete) {
      const phase = draftPhases(latest().state)[latest().state.currentPhase];
      const client = phase.team === 'blue' ? captainA : captainB;
      await wait(() => latest(client).revision === latest().revision);
      const snap = latest(client) as Snapshot & { captain: { epoch: number } };
      const message = { type: 'action', id: randomUUID(), revision: snap.revision, matchId: snap.state.matchId, gameId: snap.state.gameId,
        stepId: phase.stepId, epoch: snap.captain.epoch, action: { type: 'draft_group', team: phase.team, action: phase.action,
          heroIds: Array.from({ length: phase.count }, () => heroes[heroIndex++].id) } };
      client.ws.send(JSON.stringify(message)); client.ws.send(JSON.stringify(message));
      await wait(() => client.messages.filter(m => m.id === message.id && m.type === 'ack').length === 2);
      await wait(() => latest().revision === snap.revision + 1 && latest(reconnected).revision === latest().revision);
    }
    assert.equal(latest().state.bluePicks.length, 5); assert.equal(latest().state.redPicks.length, 5);
    assert.deepEqual(latest().state.blueBans, []); assert.deepEqual(latest().state.redBans, []);
    const gameId = latest().state.gameId;
    await rejected(captainA, { type: 'confirm_lineup', team: 'blue' });
    const confirmationGrant = await api('/api/captains', { matchId: latest().state.matchId, teamId: latest().state.blueTeam.id, operation: 'confirmation', enabled: true }) as {epoch:number};
    await wait(() => (latest(captainA) as Snapshot & {captain:{epoch:number}}).captain.epoch === confirmationGrant.epoch);
    const completedPhase = latest().state.currentPhase;
    const confirmation = sendCaptain(captainA, { type: 'confirm_lineup', team: 'blue' });
    await wait(() => captainA.messages.some(m => m.id === confirmation && m.type === 'ack'));
    await wait(() => latest().state.lineupConfirmedTeamIds.includes(latest().state.blueTeam.id));
    assert.equal(latest().state.currentPhase, completedPhase);
    await act({ type: 'commit_game' });
    await api('/api/captains', { matchId: latest().state.matchId, teamId: latest().state.blueTeam.id, operation: 'enable' });
    await api('/api/captains', { matchId: latest().state.matchId, teamId: latest().state.blueTeam.id, operation: 'assignments', enabled: true });
    await rejected(captainA, { type: 'swap_assignments', team: 'blue', from: 0, to: 1 });
    const beforeTelemetryRevision = latest().revision;
    const telemetryResponse = await fetch(base + '/api/telemetry', { headers: { Authorization: 'Bearer test-control' } });
    assert.equal(telemetryResponse.status, 200);
    const telemetryState = await telemetryResponse.json() as {sample:{players:{playerId:string}[]}};
    const session = await api('/api/telemetry/session', { matchId: latest().state.matchId, gameId }) as { token: string; sessionId: string };
    const packet = { matchId: latest().state.matchId, gameId, sessionId: session.sessionId, instanceId: randomUUID(), sequence: 1, capturedAt: Date.now(),
      data: { gameData: { gameTime: 120, gameMode: 'ARAM', mapName: 'Howling Abyss', mapNumber: 12 },
        allPlayers: [{ riotId: 'P1', team: 'ORDER', championName: 'Annie', level: 7, scores: { kills: 0, deaths: 1, assists: 2, creepScore: 20 } }],
        events: { Events: [{ EventID: 1, EventName: 'GameEnd', EventTime: 120 }] } } };
    const preview = await api('/api/telemetry/ingest', packet, session.token) as {accepted:boolean,pending:boolean};
    assert.equal(preview.accepted, false); assert.equal(preview.pending, true);
    const pending = await (await fetch(base + '/api/telemetry', { headers: { Authorization: 'Bearer test-control' } })).json() as {pending:{fingerprint:string}};
    const overlayTelemetry = await (await fetch(base + '/api/telemetry', { headers: { Authorization: 'Bearer test-overlay' } })).json() as Record<string,unknown>;
    assert.equal(overlayTelemetry.pending, undefined); assert.equal(overlayTelemetry.sessionId, undefined);
    await api('/api/telemetry/confirm', { gameId, sessionId: session.sessionId, fingerprint: pending.pending.fingerprint });
    assert.equal(latest().revision, beforeTelemetryRevision);
    assert.equal((await fetch(base + '/api/captains', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(base + '/api/telemetry/ingest', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...packet, gameId: 'old-game', sequence: 2 }) })).ok, false);
    await api('/api/telemetry/manual', { gameId, playerId: telemetryState.sample.players[0].playerId, field: 'kills', value: 12 });
    assert.equal(latest().revision, beforeTelemetryRevision);
    await act({ type: 'correct_slot', gameId, slotId: 'step-0-slot-0', heroId: heroes[50].id, reason: 'Post-lock correction' });
    assert.equal(latest().state.gameId, gameId); assert.equal(latest().state.blueScore, 0);
    const stats = await (await fetch(base + '/api/telemetry', { headers: { Authorization: 'Bearer test-control' } })).json() as {sample:{players:{stats:{kills:{value:number,frozen:boolean}}}[]}};
    assert.equal(stats.sample.players[0].stats.kills.value, 12); assert.equal(stats.sample.players[0].stats.kills.frozen, true);
    const backup = await (await fetch(base + '/api/backup', { headers: { Authorization: 'Bearer test-control' } })).json();
    await api('/api/restore', { backup });
    assert.equal((await fetch(base + '/api/match', { headers: { Authorization: `Bearer ${aToken}` } })).status, 401);
  } finally { for (const ws of sockets) ws.terminate(); proc.kill(); }
});

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

test('HTTP/WS auth, realtime broadcast, delayed REST/WS, read-only roles and reconnect', { timeout: 20000 }, async () => {
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
    for (const token of ['test-caster','test-overlay','invalid']) assert.equal((await upload(token,portrait)).status,token === 'invalid' ? 401 : 403);
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
    for (const token of ['test-caster','test-overlay','invalid']) for (const method of ['GET','POST','PUT','DELETE']) assert.equal((await presetAPI(token,method,method === 'PUT' || method === 'DELETE' ? '/missing' : '')).status,token === 'invalid' ? 401 : 403);
    const created = await presetAPI('test-control','POST','',{...initialState().blueTeam,name:'Library Test'});
    assert.equal(created.status,201);const saved = await created.json() as {id:string};
    assert.equal((await presetAPI('test-control','PUT','/'+saved.id,{...initialState().blueTeam,name:'Renamed'})).status,200);
    assert.equal((await (await presetAPI('test-control')).json() as {teams:{name:string}[]}).teams[0].name,'Renamed');
    assert.equal((await presetAPI('test-control','POST','',{name:'invalid'})).status,400);
    assert.equal((await presetAPI('test-control','DELETE','/'+saved.id)).status,200);
    assert.deepEqual((await (await presetAPI('test-control')).json() as {teams:unknown[]}).teams,[]);

    const control = await connect('test-control'), overlay = await connect('test-overlay'), caster = await connect('test-caster');
    const id = randomUUID();
    control.ws.send(JSON.stringify({ type: 'action', id, revision: 0, action: { type: 'draft_action', team: 'blue', action: 'ban', heroId: 64 } }));
    await wait(() => overlay.messages.some(m => m.revision === 1));
    assert.equal(caster.messages.length, 1);
    const delayed = await (await fetch(base + '/api/match?role=control', { headers: { Authorization: 'Bearer test-caster' } })).json() as Snapshot;
    assert.deepEqual(delayed.state.blueBans, []); assert.equal(delayed.revision, 0);
    caster.ws.send(JSON.stringify({ type: 'action', id: randomUUID(), revision: 1, action: { type: 'reset_match' } }));
    await wait(() => caster.messages.some(m => m.type === 'error'));
    assert.ok(caster.messages.some(m => m.error === '当前页面仅供查看，无法修改比赛'));
    overlay.ws.close(); const reconnected = await connect('test-overlay');
    assert.equal(reconnected.messages[0].revision, 1);
    control.ws.send(JSON.stringify({ type: 'action', id: randomUUID(), revision: 1, action: { type: 'delay', seconds: 0 } }));
    await wait(() => caster.messages.some(m => m.revision === 1));
    const latest = await (await fetch(base + '/api/match', { headers: { Authorization: 'Bearer test-caster' } })).json() as Snapshot;
    assert.deepEqual(latest.state.blueBans, [64]);
  } finally { for (const ws of sockets) ws.terminate(); proc.kill(); }
});

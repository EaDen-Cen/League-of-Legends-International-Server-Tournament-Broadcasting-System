import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import heroes from '../src/components/HeroList.js';
import type { Role } from '../src/shared/types.js';
import { TeamPresetStore } from './teamPresets.js';
import { Store } from './store.js';
import { uploadPortrait, servePortrait } from './portraits.js';
import { captureRegion, captureRegions, localCaptureRequest, recognizeClientFrame, recognizeLineup, recognizeScreen } from './capture.js';
import { LcuBridge } from './lcu.js';

const production = process.env.NODE_ENV === 'production';
const tokens: Record<Role, string> = {
  control: process.env.CONTROL_TOKEN || (production ? '' : 'local-control'),
  caster: process.env.CASTER_TOKEN || (production ? '' : 'local-caster'),
  overlay: process.env.OVERLAY_TOKEN || (production ? '' : 'local-overlay'),
};
if (Object.values(tokens).some(t => !t || (production && t.length < 24)) || new Set(Object.values(tokens)).size !== 3) throw new Error('Set three distinct tokens of at least 24 characters in production');
const roleFor = (token: unknown): Role | undefined => (Object.keys(tokens) as Role[]).find(role => tokens[role] === token);
const project = fileURLToPath(new URL('../', import.meta.url));
const dataFile = resolve(process.env.DATA_FILE || resolve(project, 'data/lol/match.json'));
const presets = new TeamPresetStore(resolve(dirname(dataFile), 'team-presets.json'));
const store = new Store(dataFile, Date.now, presets);
const uploadDirectory = resolve(process.env.UPLOAD_DIR || resolve(dirname(dataFile), 'uploads/player-portraits'));
let lcu: LcuBridge | undefined;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.headers.origin && allowedOrigins.includes(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  const json = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/recognize-frame') {
      if (req.method !== 'POST') { json(405,{error:'POST required'}); return; }
      if (roleFor(req.headers.authorization?.replace(/^Bearer /,'')) !== 'control') { json(403,{error:'Control only'}); req.resume(); return; }
      if (store.data.state.bpInputMode !== 'screen') { json(409,{error:'Screen input is not enabled'}); req.resume(); return; }
      try {
        const chunks:Buffer[]=[]; let size=0; req.setTimeout(10000,()=>req.destroy());
        for await (const chunk of req) {
          size+=chunk.length;
          if(size>4*1024*1024){ json(413,{error:'Frame too large'}); return; }
          chunks.push(chunk);
        }
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(input.revision!==store.data.revision){ json(409,{error:'Stale capture'}); return; }
        const result=await recognizeClientFrame(input.image);
        if(input.revision!==store.data.revision){ json(409,{error:'State changed during capture'}); return; }
        json(200,result);
      } catch {
        json(400,{error:'Browser frame recognition failed'});
      }
      return;
    }
    if (url.pathname === '/api/capture') {
      if (req.method !== 'POST') { json(405, {error:'POST required'}); return; }
      if (roleFor(req.headers.authorization?.replace(/^Bearer /, '')) !== 'control' || !localCaptureRequest(req)) { json(403,{error:'Local control only'}); req.resume(); return; }
      if (process.platform !== 'win32' || process.env.LOL_CAPTURE_ENABLED !== '1' || store.data.state.bpInputMode !== 'screen') { json(503,{error:'Windows capture is not enabled'}); req.resume(); return; }
      try {
        let body = ''; req.setTimeout(5000, () => req.destroy());
        for await (const chunk of req) { body += chunk; if (body.length > 2048) { json(413,{error:'Request too large'}); return; } }
        const input = JSON.parse(body);
        if (input.revision !== store.data.revision) { json(409,{error:'Stale capture'}); return; }
        const result = await recognizeScreen(captureRegion(input.region));
        if (input.revision !== store.data.revision) { json(409,{error:'State changed during capture'}); return; }
        json(200,result);
      } catch { json(400,{error:'Capture failed; check region and visible desktop'}); }
      return;
    }
    if (url.pathname === '/api/capture-lineup') {
      if (req.method !== 'POST') { json(405, {error:'POST required'}); return; }
      if (roleFor(req.headers.authorization?.replace(/^Bearer /, '')) !== 'control' || !localCaptureRequest(req)) { json(403,{error:'Local control only'}); req.resume(); return; }
      if (process.platform !== 'win32' || process.env.LOL_CAPTURE_ENABLED !== '1' || store.data.state.bpInputMode !== 'screen') { json(503,{error:'Windows capture is not enabled'}); req.resume(); return; }
      if (!store.data.state.draftComplete || store.data.state.committedGameId) { json(409,{error:'Lineup sync requires a completed uncommitted draft'}); req.resume(); return; }
      try {
        const chunks: Buffer[] = []; let size = 0; req.setTimeout(5000, () => req.destroy());
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) { json(413,{error:'Request too large'}); return; }
          chunks.push(chunk);
        }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (input.revision !== store.data.revision) { json(409,{error:'Stale capture'}); return; }
        const regions = captureRegions(input.regions);
        const state = store.data.state;
        const allowed = [
          ...Array.from({length:5},()=>[...state.bluePicks]),
          ...Array.from({length:5},()=>[...state.redPicks]),
        ];
        const results = await recognizeLineup(regions, allowed);
        if (input.revision !== store.data.revision) { json(409,{error:'State changed during capture'}); return; }
        json(200,{slots:results.map((result,index)=>({
          side:index < 5 ? 'blue' : 'red',
          playerIndex:index % 5,
          ...result,
        }))});
      } catch { json(400,{error:'Lineup capture failed; check all ten player regions and visible desktop'}); }
      return;
    }
    if (url.pathname === '/api/team-presets' || url.pathname.startsWith('/api/team-presets/')) {
      const role = roleFor(req.headers.authorization?.replace(/^Bearer /, ''));
      if (role !== 'control' || (production && req.headers.origin && !allowedOrigins.includes(req.headers.origin))) { json(role ? 403 : 401, {error:'uploadUnauthorized'}); req.resume(); return; }
      const id = url.pathname.slice('/api/team-presets/'.length);
      const collection = url.pathname === '/api/team-presets';
      try {
        if (req.method === 'GET' && collection) { json(200, {teams:presets.list()}); return; }
        if (req.method === 'DELETE' && !collection) { presets.delete(id); json(200, {ok:true}); return; }
        if ((req.method === 'POST' && collection) || (req.method === 'PUT' && !collection)) {
          if (!req.headers['content-type']?.startsWith('application/json')) { json(415, {error:'presetInvalid'}); req.resume(); return; }
          const chunks: Buffer[] = []; let size = 0;
          req.setTimeout(15000, () => req.destroy());
          for await (const chunk of req) { size += chunk.length; if (size > 65536) { json(413, {error:'presetInvalid'}); return; } chunks.push(chunk); }
          let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(400, {error:'presetInvalid'}); return; }
          json(collection ? 201 : 200, collection ? presets.create(input) : presets.update(id, input)); return;
        }
        json(405, {error:'不支持此请求方式'}); return;
      } catch (e) {
        const error = e instanceof Error ? e.message : '';
        json(error === 'presetMissing' ? 404 : ['presetInvalid','substitutesInvalid'].includes(error) ? 400 : 500, {error: ['presetMissing','presetInvalid','substitutesInvalid'].includes(error) ? error : 'presetSaveFailed'}); return;
      }
    }
    if (url.pathname === '/api/uploads/player-portrait' && req.method === 'POST') {
      const role = roleFor(req.headers.authorization?.replace(/^Bearer /, ''));
      if (role !== 'control') { json(role ? 403 : 401, { error: 'uploadUnauthorized' }); req.resume(); return; }
      if (production && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) { json(403, { error: 'uploadUnauthorized' }); req.resume(); return; }
      await uploadPortrait(req, res, uploadDirectory); return;
    }
    if (req.method !== 'GET') { json(405, { error: '不支持此请求方式' }); return; }
    if (url.pathname.startsWith('/uploads/player-portraits/')) { await servePortrait(url.pathname, res, uploadDirectory); return; }
    if (url.pathname === '/api/health') { json(200, { ok: true }); return; }
    if (url.pathname.startsWith('/api/')) {
      const role = roleFor(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!role) { json(401, { error: '访问口令缺失或无效，请重新输入' }); return; }
      if (url.pathname === '/api/match') json(200, store.snapshot(role));
      else if (url.pathname === '/api/heroes') json(200, heroes);
      else if (url.pathname === '/api/lcu/status') {
        if (role !== 'control') json(403, { error: 'Control only' });
        else json(200, lcu?.status() ?? { clientConnected:false, sessionActive:false });
      }
      else json(404, { error: '找不到请求的内容' });
      return;
    }
    const root = resolve(project, 'dist');
    const route = ['/', '/control', '/caster', '/overlay/draft'].includes(url.pathname);
    const file = resolve(root, route ? 'index.html' : `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) { json(404, { error: '找不到请求的内容' }); return; }
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { json(404, { error: '找不到页面或文件，请联系导播检查网页是否已构建' }); }
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
interface Client { role?: Role; last?: string; alive: boolean; count: number; window: number }
const clients = new Map<WebSocket, Client>();
function update(ws: WebSocket, force = false) {
  const c = clients.get(ws);
  if (!c?.role || ws.readyState !== WebSocket.OPEN) return;
  const payload = JSON.stringify(store.snapshot(c.role));
  if (force || c.last !== payload) {
    if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
    ws.send(payload); c.last = payload;
  }
}
lcu = new LcuBridge(store, () => {
  for (const client of clients.keys()) update(client);
});
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (production && origin && !allowedOrigins.includes(origin)) { ws.close(1008, '此页面地址无权连接'); return; }
  clients.set(ws, { alive: true, count: 0, window: Date.now() });
  const authTimeout = setTimeout(() => { if (!clients.get(ws)?.role) ws.close(1013, '身份验证超时，请重试'); }, 5000);
  ws.on('pong', () => { const c = clients.get(ws); if (c) c.alive = true; });
  ws.on('error', () => ws.terminate());
  ws.on('close', () => { clearTimeout(authTimeout); clients.delete(ws); });
  ws.on('message', raw => {
    const c = clients.get(ws)!;
    let id: unknown;
    try {
      if (Date.now() - c.window > 1000) { c.window = Date.now(); c.count = 0; }
      if (++c.count > 30) { ws.close(1008, '操作过于频繁，请稍后重试'); return; }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { throw new Error('消息格式无效，请重新连接后重试'); }
      if (!message || typeof message !== 'object') throw new Error('消息格式无效，请重新连接后重试');
      id = message.id;
      if (!c.role) {
        c.role = message.type === 'auth' ? roleFor(message.token) : undefined;
        if (!c.role) { ws.close(1008, '访问口令无效'); return; }
        clearTimeout(authTimeout); update(ws, true); return;
      }
      if (message.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
      if (c.role !== 'control') throw new Error('当前页面仅供查看，无法修改比赛');
      if (message.type !== 'action') throw new Error('不支持此消息类型');
      store.apply(message.id, message.revision, message.action);
      for (const client of clients.keys()) update(client);
      ws.send(JSON.stringify({ type: 'ack', id: message.id }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', id: typeof id === 'string' ? id : undefined, error: e instanceof Error ? e.message : '消息无效' }));
      update(ws, true);
    }
  });
});
const tick = setInterval(() => { for (const ws of clients.keys()) update(ws); }, 200);
const lcuTick = setInterval(() => { void lcu?.poll(); }, 750);
const heartbeat = setInterval(() => { for (const [ws, c] of clients) { if (!c.alive) ws.terminate(); else { c.alive = false; ws.ping(); } } }, 15000);
server.listen(Number(process.env.PORT || 3001), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => console.log('LoL Broadcast server ready on port ' + (process.env.PORT || 3001)));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  clearInterval(tick); clearInterval(lcuTick); clearInterval(heartbeat); for (const ws of clients.keys()) ws.close(1001, '服务器正在停止');
  server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref();
});

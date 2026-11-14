import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import heroes from '../src/components/HeroList.js';
import type { Action, Role, Snapshot } from '../src/shared/types.js';
import { draftPhases } from '../src/shared/gameRules.js';
import { seriesFinished } from '../src/shared/draftRules.js';
import { TeamPresetStore } from './teamPresets.js';
import { Store } from './store.js';
import { CaptainAccess, type CaptainIdentity } from './captainAccess.js';
import { TelemetryStore } from './telemetry.js';
import { uploadPortrait, servePortrait } from './portraits.js';
import { LcuBridge } from './lcu.js';

const production = process.env.NODE_ENV === 'production';
const tokens = {
  control: process.env.CONTROL_TOKEN || (production ? '' : 'local-control'),
  overlay: process.env.OVERLAY_TOKEN || (production ? '' : 'local-overlay'),
};
if (Object.values(tokens).some(t => !t || (production && t.length < 24)) || tokens.control === tokens.overlay) throw Error('Set two distinct CONTROL_TOKEN/OVERLAY_TOKEN secrets of at least 24 characters in production');
const project = fileURLToPath(new URL('../', import.meta.url));
const dataFile = resolve(process.env.DATA_FILE || resolve(project, 'data/lol/match.json'));
const presets = new TeamPresetStore(resolve(dirname(dataFile), 'team-presets.json'));
const store = new Store(dataFile, Date.now, presets);
const access = new CaptainAccess(`${dataFile}.access.json`);
const telemetry = new TelemetryStore(`${dataFile}.telemetry.json`);
const uploadDirectory = resolve(process.env.UPLOAD_DIR || resolve(dirname(dataFile), 'uploads/player-portraits'));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
type Identity = { role: 'control' | 'overlay' } | CaptainIdentity;
function identityFor(token: unknown): Identity | undefined {
  if (typeof token !== 'string') return;
  if (token === tokens.control) return { role: 'control' };
  if (token === tokens.overlay) return { role: 'overlay' };
  return access.identify(token);
}
const roleFor = (token: unknown): Role | undefined => identityFor(token)?.role;
function validCaptain(identity: CaptainIdentity) {
  const state = store.data.state;
  if (identity.matchId !== state.matchId || ![state.blueTeam.id, state.redTeam.id].includes(identity.teamId)) throw Error('队长链接不属于当前比赛');
  return access.current(identity);
}
function view(identity: Identity): Snapshot {
  const snapshot = store.snapshot(identity.role);
  if (identity.role !== 'control') {
    delete snapshot.state.seriesRules;
    snapshot.state.ruleConflicts = [];
  }
  if (identity.role === 'captain') {
    const grant = validCaptain(identity);
    return { ...snapshot, captain: { teamId: grant.teamId, mode: grant.mode, epoch: grant.epoch, assignmentsAllowed: grant.assignmentsAllowed, finalConfirmationAllowed: grant.finalConfirmationAllowed } } as Snapshot;
  }
  if (identity.role === 'control') return { ...snapshot, captains: access.list(snapshot.state.matchId, [snapshot.state.blueTeam.id, snapshot.state.redTeam.id]).map(grant => ({ ...grant, online: [...clients.values()].filter(c => c.identity?.role === 'captain' && c.identity.teamId === grant.teamId && c.identity.matchId === snapshot.state.matchId).length })) } as Snapshot;
  return snapshot;
}
async function body(req: IncomingMessage, maximum = 2 * 1024 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Error('JSON required');
  const chunks: Buffer[] = []; let size = 0;
  req.setTimeout(15000, () => req.destroy());
  for await (const chunk of req) { size += chunk.length; if (size > maximum) throw Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function knownGame(gameId: unknown): asserts gameId is string {
  if (typeof gameId !== 'string' || (gameId !== store.data.state.gameId && !store.data.state.draftHistory.some(r => r.id === gameId))) throw Error('找不到该局，请刷新当前比赛');
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.headers.origin && allowedOrigins.includes(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  const json = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const identity = identityFor(req.headers.authorization?.replace(/^Bearer /, ''));
    if (production && req.headers.origin && !allowedOrigins.includes(req.headers.origin) && url.pathname.startsWith('/api/')) { json(403, { error: 'Origin rejected' }); req.resume(); return; }
    if (url.pathname === '/api/backup' || url.pathname === '/api/restore') {
      if (identity?.role !== 'control') { json(identity ? 403 : 401, { error: 'Control only' }); req.resume(); return; }
      if (url.pathname === '/api/backup' && req.method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename="lol-match-backup.json"'); json(200, store.exportBackup()); return;
      }
      if (url.pathname === '/api/restore' && req.method === 'POST') {
        const input = await body(req, 64 * 1024 * 1024 + 1024);
        const state = store.data.state;
        for (const teamId of [state.blueTeam.id, state.redTeam.id]) access.change(state.matchId, teamId, 'disable');
        store.restoreBackup(input.backup);
        const restored = store.data.state;
        for (const teamId of [restored.blueTeam.id, restored.redTeam.id]) access.change(restored.matchId, teamId, 'disable');
        broadcast(); json(200, view(identity)); return;
      }
      json(405, { error: 'Method not allowed' }); return;
    }
    if (url.pathname === '/api/captains') {
      if (identity?.role !== 'control') { json(identity ? 403 : 401, { error: 'Control only' }); req.resume(); return; }
      if (req.method === 'GET') { json(200, view(identity)); return; }
      if (req.method !== 'POST') { json(405, { error: 'POST required' }); return; }
      const input = await body(req);
      const state = store.data.state;
      if (input.matchId !== state.matchId || ![state.blueTeam.id, state.redTeam.id].includes(input.teamId) || seriesFinished(state)) throw Error('队伍或比赛状态不允许授权');
      const result = access.change(input.matchId, input.teamId, input.operation, input.enabled);
      broadcast(); json(200, result); return;
    }
    if (url.pathname.startsWith('/api/telemetry')) {
      if (url.pathname === '/api/telemetry/ingest' && req.method === 'POST') {
        const input = await body(req);
        const result = telemetry.ingest(req.headers.authorization?.replace(/^Bearer /, '') || '', input, { matchId: store.data.state.matchId, gameId: store.data.state.gameId });
        json(200, result); return;
      }
      if (!identity || identity.role === 'captain') { json(identity ? 403 : 401, { error: 'Telemetry access denied' }); req.resume(); return; }
      if (req.method !== 'GET' && identity.role !== 'control') { json(403, { error: 'Control only' }); req.resume(); return; }
      const input = req.method === 'GET' || req.method === 'DELETE' ? undefined : await body(req);
      const gameId = input?.gameId ?? url.searchParams.get('gameId') ?? store.data.state.gameId;
      knownGame(gameId);
      const record = store.data.state.draftHistory.find(r => r.id === gameId) ?? store.data.state;
      telemetry.initializeManual(store.data.state.matchId, gameId, (['blue', 'red'] as const).flatMap(side => record[`${side}Team`].players.map((name, index) => ({
        playerId: record[`${side}Team`].playerIds?.[index] ?? `${record[`${side}Team`].id}-p${index + 1}`,
        riotId: name || `P${index + 1}`, team: side === 'blue' ? 'ORDER' as const : 'CHAOS' as const,
        championId: record[`${side}Assignments`][index] ?? null,
        championName: heroes.find(h => h.id === record[`${side}Assignments`][index])?.chineseName ?? '',
      }))));
      if (req.method === 'GET' && url.pathname === '/api/telemetry') {
        const data = telemetry.snapshot(gameId);
        if (identity.role === 'overlay') { delete data.pending; delete data.sessionId; delete data.lastError; json(200, data); }
        else json(200, data);
      } else if (req.method === 'GET' && url.pathname === '/api/telemetry/export' && identity.role === 'control') {
        res.setHeader('Content-Disposition', `attachment; filename="telemetry-${gameId}.json"`); json(200, telemetry.export(gameId));
      } else if (req.method === 'POST' && url.pathname === '/api/telemetry/session') {
        if (input.matchId !== store.data.state.matchId || gameId !== store.data.state.gameId) throw Error('只能绑定当前比赛与小局');
        json(200, telemetry.begin(input.matchId, gameId));
      } else if (req.method === 'DELETE' && url.pathname === '/api/telemetry/session') { telemetry.end(gameId); json(200, { ok: true }); }
      else if (req.method === 'POST' && url.pathname === '/api/telemetry/confirm') { telemetry.confirm(gameId, input.sessionId, input.fingerprint); json(200, { ok: true }); }
      else if (req.method === 'POST' && url.pathname === '/api/telemetry/manual') { telemetry.manual(gameId, input); json(200, { ok: true }); }
      else if (req.method === 'POST' && url.pathname === '/api/telemetry/resume') { telemetry.resume(gameId, input.playerId, input.field); json(200, { ok: true }); }
      else json(404, { error: 'Unknown telemetry endpoint' });
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
      if (!identity) { json(401, { error: '访问口令缺失或无效，请重新输入' }); return; }
      if (identity.role === 'captain') validCaptain(identity);
      if (url.pathname === '/api/match') json(200, view(identity));
      else if (url.pathname === '/api/heroes') json(200, heroes);
      else if (url.pathname.startsWith('/api/actions/')) {
        const id = url.pathname.slice('/api/actions/'.length);
        const event = store.data.events.find(e => e.id === id);
        if (identity.role === 'overlay' || (identity.role === 'captain' && event && (event.actor?.role !== 'captain' || event.actor.teamId !== identity.teamId || event.resultingState.matchId !== identity.matchId))) json(403, { error: 'Read only' });
        else json(200, { confirmed: !!event, revision: event?.revision });
      } else if (url.pathname === '/api/lcu/status' && identity.role === 'control') json(200, lcu.status());
      else json(404, { error: '找不到请求的内容' });
      return;
    }
    if (url.pathname === '/caster') { json(410, { error: '解说端已移除' }); return; }
    const root = resolve(project, 'dist');
    const route = ['/', '/control', '/captain', '/overlay/draft', '/ghud', '/overlay/ghud'].includes(url.pathname);
    const file = resolve(root, route ? 'index.html' : `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) { json(404, { error: '找不到请求的内容' }); return; }
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) { if (!res.headersSent) { const missing = (e as NodeJS.ErrnoException)?.code === 'ENOENT'; json(missing ? 404 : 400, { error: missing ? '找不到页面或文件，请先构建应用' : e instanceof Error ? e.message : '请求无效' }); } }
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
interface Client { identity?: Identity; last?: string; alive: boolean; count: number; window: number }
const clients = new Map<WebSocket, Client>();
function update(ws: WebSocket, force = false) {
  const c = clients.get(ws);
  if (!c?.identity || ws.readyState !== WebSocket.OPEN) return;
  let payload;
  try { payload = JSON.stringify(view(c.identity)); } catch { ws.close(1008, '队长链接已失效'); return; }
  if (force || c.last !== payload) {
    if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
    ws.send(payload); c.last = payload;
  }
}
function broadcast() { for (const ws of clients.keys()) update(ws); }
const lcu = new LcuBridge();
const directorEdits = new Set(['draft_action', 'draft_group', 'skip_ban', 'advance_draft', 'pause_draft', 'correct_slot', 'rewind_draft', 'current_rules', 'history_assignments', 'reorder_players', 'swap_assignments', 'swap_picks', 'set_lineup_assignments', 'confirm_lineup', 'commit_game', 'undo', 'reset_draft', 'reset_match', 'next_game', 'swap_sides', 'settings', 'series_rules']);
wss.on('connection', (ws, req) => {
  if (production && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) { ws.close(1008, '此页面地址无权连接'); return; }
  clients.set(ws, { alive: true, count: 0, window: Date.now() });
  const timeout = setTimeout(() => { if (!clients.get(ws)?.identity) ws.close(1008, '身份验证超时'); }, 5000);
  ws.on('pong', () => { const c = clients.get(ws); if (c) c.alive = true; });
  ws.on('error', () => ws.terminate());
  ws.on('close', () => { clearTimeout(timeout); clients.delete(ws); broadcast(); });
  ws.on('message', raw => {
    const c = clients.get(ws)!; let id: unknown;
    try {
      if (Date.now() - c.window > 1000) { c.window = Date.now(); c.count = 0; }
      if (++c.count > 30) { ws.close(1008, '操作过于频繁'); return; }
      const message = JSON.parse(raw.toString());
      if (!message || typeof message !== 'object') throw Error('消息无效');
      id = message.id;
      if (!c.identity) {
        c.identity = message.type === 'auth' ? identityFor(message.token) : undefined;
        if (!c.identity) { ws.close(1008, '访问口令无效'); return; }
        if (c.identity.role === 'captain') validCaptain(c.identity);
        clearTimeout(timeout); update(ws, true); broadcast(); return;
      }
      if (c.identity.role === 'captain') validCaptain(c.identity);
      if (message.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
      if (message.type !== 'action') throw Error('不支持此消息类型');
      const identity = c.identity, state = store.data.state;
      if (identity.role === 'overlay') throw Error('直播页面只读');
      const receipt = store.data.events.find(e => e.id === message.id);
      if (receipt) {
        if (identity.role === 'captain' && (receipt.actor?.role !== 'captain' || receipt.actor.teamId !== identity.teamId || receipt.resultingState.matchId !== identity.matchId)) throw Error('动作编号已被其他操作者使用');
        update(ws, true); ws.send(JSON.stringify({ type: 'ack', id: message.id })); return;
      }
      const action = message.action as Action;
      if (identity.role === 'captain') {
        const grant = validCaptain(identity), phase = draftPhases(state)[state.currentPhase];
        if (grant.mode !== 'enabled' || state.bpPaused || state.committedGameId || seriesFinished(state)) throw Error('等待导播授权、恢复或接管结束；已归档后仅导播可更正');
        if (message.matchId !== state.matchId || message.gameId !== state.gameId || message.epoch !== grant.epoch) throw Error('局次或授权已变化，请按最新状态重试');
        if (message.revision !== store.data.revision) throw Error('BP版本已变化，请按最新状态重试');
        if (!action || !['draft_action', 'draft_group', 'skip_ban', 'swap_assignments', 'confirm_lineup'].includes(action.type)) throw Error('队长无此操作权限');
        const side = state.blueTeam.id === identity.teamId ? 'blue' : 'red';
        if (!('team' in action) || action.team !== side) throw Error('不能操作对方队伍');
        if (action.type === 'swap_assignments') {
          if (!grant.assignmentsAllowed || !state.draftComplete) throw Error('导播未开放最终归属调整');
        } else if (action.type === 'confirm_lineup') {
          if (!grant.finalConfirmationAllowed || !state.draftComplete) throw Error('导播未开放最终阵容确认');
        } else if (!phase || state.draftComplete || message.stepId !== phase.stepId || phase.team !== side) throw Error('当前步骤不属于本队');
      } else if (directorEdits.has(action?.type)) {
        if (message.revision !== store.data.revision) throw Error('BP版本已变化，请按最新状态重试');
        access.suspend(state.matchId, [state.blueTeam.id, state.redTeam.id]);
      }
      store.apply(message.id, message.revision, action, { role: identity.role, ...(identity.role === 'captain' ? { teamId: identity.teamId } : {}) });
      if (seriesFinished(store.data.state)) access.suspend(state.matchId, [state.blueTeam.id, state.redTeam.id]);
      broadcast(); ws.send(JSON.stringify({ type: 'ack', id: message.id }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', id: typeof id === 'string' ? id : undefined, error: e instanceof Error ? e.message : '消息无效' }));
      broadcast(); update(ws, true);
    }
  });
});
const lcuTick = setInterval(() => { void lcu.poll(); }, 1500);
const heartbeat = setInterval(() => { for (const [ws, c] of clients) { if (!c.alive) ws.terminate(); else { c.alive = false; ws.ping(); } } }, 15000);
server.listen(Number(process.env.PORT || 3001), process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => console.log('LoL Broadcast server ready on port ' + (process.env.PORT || 3001)));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  clearInterval(lcuTick); clearInterval(heartbeat); for (const ws of clients.keys()) ws.close(1001, '服务器正在停止');
  server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref();
});

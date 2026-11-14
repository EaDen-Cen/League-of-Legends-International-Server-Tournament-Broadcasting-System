import { randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('Run on the game computer: node --env-file=bridge.env scripts/game-bridge.mjs\n'
    + 'Required environment: BRIDGE_SERVER_URL, BRIDGE_MATCH_ID, BRIDGE_GAME_ID, BRIDGE_SESSION_ID, BRIDGE_TOKEN.\n'
    + 'The director creates a collection session, then confirms the detected game roster.\n'
    + 'Only local HTTPS 127.0.0.1:2999/liveclientdata/allgamedata is read. No game controls or BP writes.');
  process.exit(0);
}
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in bridge.env`);
  return value;
};
const server = new URL(required('BRIDGE_SERVER_URL'));
if (server.username || server.password || server.search || server.hash) throw new Error('Use a server origin without credentials, query or fragment');
if (server.protocol !== 'https:' && !(server.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname)))
  throw new Error('Public collection requires HTTPS');
const endpoint = new URL('/api/telemetry/ingest', server);
const binding = { matchId: required('BRIDGE_MATCH_ID'), gameId: required('BRIDGE_GAME_ID'), sessionId: required('BRIDGE_SESSION_ID') };
const token = required('BRIDGE_TOKEN');
let instanceId = randomUUID();
let sequence = 0;
let previousTime;
let localDisconnected = false;
let lastStatus = '';
let running = true;
const status = value => { if (value !== lastStatus) { console.log(value); lastStatus = value; } };
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

function readGame() {
  return new Promise((resolve, reject) => {
    // Riot's game certificate is self-signed. This exception is limited to loopback.
    const req = request({ hostname: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', method: 'GET',
      rejectUnauthorized: false, timeout: 2000, headers: { Accept: 'application/json' } }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { req.destroy(new Error('Game response too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('Game API unavailable')); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid game JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Game API timed out')));
    req.on('error', reject); req.end();
  });
}

status('Waiting for a local game. Director confirmation is required before publication.');
while (running) {
  let data;
  try { data = await readGame(); }
  catch {
    localDisconnected = true;
    status('Local Game API disconnected. Last server sample becomes stale; BP is unaffected.');
    await delay(1000); continue;
  }
  const time = data?.gameData?.gameTime;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    status('Local Game API returned an unsupported sample. Waiting for valid game data.');
    await delay(1000); continue;
  }
  if ((localDisconnected && previousTime !== undefined) || (previousTime !== undefined && time < previousTime)) instanceId = randomUUID();
  localDisconnected = false; previousTime = time;
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...binding, instanceId, sequence: sequence++, capturedAt: Date.now(), data }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      if ([400, 401, 403, 409].includes(response.status)) {
        status(`Collection rejected (HTTP ${response.status}). Stop and ask the director to review/recreate the session; no sample was replayed.`);
        process.exitCode = 1; break;
      }
      status(`Collection server unavailable (HTTP ${response.status}). Sending only fresh samples when it returns.`);
    } else {
      const result = await response.json();
      status(result.pending ? 'Connected. Awaiting director confirmation of the detected roster.' : 'Live Client samples accepted. Game end remains a director decision.');
    }
  } catch { status('Collection server disconnected. Sending only fresh samples when it returns.'); }
  await delay(1000);
}

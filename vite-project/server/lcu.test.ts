import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { credentialsFromCommandLine, LcuBridge, lcuGet, parseLockfile } from './lcu.js';

test('LCU credentials stay local and lockfile supports standard/extra-address format', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lol-lcu-'));
  try {
    const path = join(directory, 'lockfile');
    writeFileSync(path, 'LeagueClient:123:4321:secret:https');
    assert.deepEqual(parseLockfile(path), { port: 4321, token: 'secret', protocol: 'https', source: 'lockfile' });
    writeFileSync(path, 'LeagueClient:123:127.0.0.1:4322:other:http');
    assert.equal(parseLockfile(path)?.port, 4322);
    assert.equal(credentialsFromCommandLine('--app-port=4323 --remoting-auth-token=private')?.port, 4323);
    writeFileSync(path, 'invalid'); assert.equal(parseLockfile(path), undefined);
  } finally { rmSync(directory, { recursive: true }); }
});

test('LCU uses GET with local authorization; no BP state or action is needed', async () => {
  const server = createServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/lol-gameflow/v1/gameflow-phase');
    assert.equal(req.headers.authorization, `Basic ${Buffer.from('riot:private').toString('base64')}`);
    res.end(JSON.stringify('InProgress'));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const response = await lcuGet({ port: address.port, token: 'private', protocol: 'http', source: 'env' }, '/lol-gameflow/v1/gameflow-phase');
    assert.equal(response.data, 'InProgress');
    const bridge = new LcuBridge(() => false);
    await bridge.poll();
    assert.deepEqual(bridge.status(), { clientConnected: false, sessionActive: false });
    assert.ok(!JSON.stringify(bridge.status()).includes('private'));
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

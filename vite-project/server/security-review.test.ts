import assert from 'node:assert/strict';
import test from 'node:test';
import { Store } from './store.js';

test('restoring a backup drops unknown private fields before public role snapshots', () => {
  const store = new Store();
  const backup = store.exportBackup();
  const imported = { ...backup, state: { ...backup.state,
    directorSecrets: { controlToken: 'private-control-example' },
    blueTeam: { ...backup.state.blueTeam, captainInvite: 'private-team-example' },
    heroDataOverrides: { '1': { chineseName: '测试安妮', internalSecret: 'private-art-example' } },
  } };
  store.restoreBackup(imported);
  for (const role of ['captain', 'overlay'] as const) {
    const payload = JSON.stringify(store.snapshot(role));
    assert.equal(payload.includes('private-control-example'), false);
    assert.equal(payload.includes('private-team-example'), false);
    assert.equal(payload.includes('private-art-example'), false);
  }
});

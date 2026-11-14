import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaptainAccess } from './captainAccess.js';

test('invite rotation revokes existing identities, survives restart, and never exposes hashes', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'lol-grants-')), 'access.json');
  let access = new CaptainAccess(file);
  const first = access.change('match-a', 'team-a', 'rotate').token!;
  const identity = access.identify(first)!;
  assert.equal(access.current(identity).mode, 'disabled');
  access.change('match-a', 'team-a', 'enable');
  const epoch = access.current(identity).epoch;
  access.suspend('match-a', ['team-a']);
  assert.ok(access.current(identity).epoch > epoch);
  assert.equal(access.current(identity).mode, 'takeover');
  const second = access.change('match-a', 'team-a', 'rotate').token!;
  assert.notEqual(first, second);
  assert.throws(() => access.current(identity), /失效/);
  access = new CaptainAccess(file);
  assert.equal(access.identify(first), undefined);
  assert.ok(access.identify(second));
  assert.equal(JSON.stringify(access.list('match-a', ['team-a'])).includes('hash'), false);
  assert.equal(readFileSync(file, 'utf8').includes(second), false);
  access.change('match-a', 'team-a', 'disable');
  assert.equal(access.identify(second), undefined);
});

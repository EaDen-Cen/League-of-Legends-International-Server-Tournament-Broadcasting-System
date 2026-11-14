import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState } from '../src/shared/types.js';
import { telemetryTeam, telemetryTeamKills } from '../src/shared/telemetryView.js';
import { parseLiveClient } from './telemetry.js';

function teamPlayers() {
  const player = parseLiveClient({ gameData: { gameTime: 10 }, allPlayers: [{ riotId: 'A#1', team: 'ORDER', scores: { kills: 1 } }] }, 1000).players[0];
  return Array.from({ length: 5 }, (_, index) => ({ ...player, playerId: `team-a-p${index + 1}` }));
}

test('GHUD totals require five distinct players with known kills, including true zero', () => {
  const players = teamPlayers();
  assert.equal(telemetryTeamKills(players), 5);
  assert.equal(telemetryTeamKills(players.slice(0, 1)), null);
  assert.equal(telemetryTeamKills(players.slice(0, 4)), null);
  assert.equal(telemetryTeamKills([...players.slice(0, 4), players[0]]), null);
  players[0] = { ...players[0], stats: { ...players[0].stats, kills: { ...players[0].stats.kills, value: 0 } } };
  assert.equal(telemetryTeamKills(players), 4);
  players[0].stats.kills.availability = 'unknown';
  assert.equal(telemetryTeamKills(players), null);
});

test('GHUD actual teams keep their name/score/logo across BP color swaps and never guess unmatched identities', () => {
  const state = initialState(), players = teamPlayers();
  state.blueTeam.name = 'Team A'; state.blueTeam.logo = '/a.png'; state.blueScore = 1; state.redScore = 2;
  let identity = telemetryTeam(state, players);
  assert.equal(identity?.team.name, 'Team A'); assert.equal(identity?.score, 1); assert.equal(identity?.team.logo, '/a.png');
  [state.blueTeam, state.redTeam] = [state.redTeam, state.blueTeam];
  [state.blueScore, state.redScore] = [state.redScore, state.blueScore];
  identity = telemetryTeam(state, players);
  assert.equal(identity?.side, 'red'); assert.equal(identity?.team.name, 'Team A'); assert.equal(identity?.score, 1); assert.equal(identity?.team.logo, '/a.png');
  assert.equal(telemetryTeam(state, [{ ...players[0], playerId: 'unmatched-api-id' }]), undefined);
  assert.equal(telemetryTeam(state, [players[0], { ...players[1], playerId: 'team-b-p1' }]), undefined);
  assert.equal(telemetryTeam(state, []), undefined);
});

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { phases, type Action, type MatchState, type Side } from '../src/shared/types.js';
import type { Store } from './store.js';

type LcuCredentials = {
  port: number;
  token: string;
  protocol: 'http' | 'https';
  source: 'env' | 'lockfile' | 'process';
};

export type LcuChampSelectAction = {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  type: 'ban' | 'pick' | string;
  isAllyAction?: boolean;
  isInProgress?: boolean;
  pickTurn?: number;
};

export type LcuChampSelectPlayer = {
  cellId: number;
  championId?: number;
  team?: number;
};

export type LcuChampSelectSession = {
  actions?: LcuChampSelectAction[][];
  myTeam?: LcuChampSelectPlayer[];
  theirTeam?: LcuChampSelectPlayer[];
  localPlayerCellId?: number;
  timer?: { phase?: string };
};

export type LcuMappedAction = {
  id: number;
  phaseIndex: number;
  side: Side;
  action: 'ban' | 'pick';
  championId: number;
  completed: boolean;
};

export type LcuDraftMode = 'tournament' | 'pick-only-practice';

export type LcuStatus = {
  clientConnected: boolean;
  sessionActive: boolean;
  source?: LcuCredentials['source'];
  localSide?: Side;
  phase?: string;
  draftMode?: LcuDraftMode;
  actionSummary?: { groups:number; bans:number; picks:number; completedBans:number; completedPicks:number; myRoster:number; theirRoster:number };
  lastSyncAt?: number;
  lastError?: string;
  lastAction?: { side: Side; action: 'ban' | 'pick'; championId: number | null };
};

const opposite = (side: Side): Side => side === 'blue' ? 'red' : 'blue';

function parseLockfile(path: string): LcuCredentials | undefined {
  if (!existsSync(path)) return;
  const parts = readFileSync(path, 'utf8').trim().split(':');
  // Standard League lockfile: process:pid:port:password:protocol.
  // A few launchers add an address field; accept both forms.
  const portIndex = parts.length === 5 ? 2 : parts.length === 6 ? 3 : -1;
  if (portIndex < 0) return;
  const port = Number(parts[portIndex]);
  const token = parts[portIndex + 1];
  const protocol = parts[portIndex + 2] === 'http' ? 'http' : 'https';
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !token) return;
  return { port, token, protocol, source: 'lockfile' };
}

function credentialsFromCommandLine(command: string): LcuCredentials | undefined {
  const port = command.match(/--app-port(?:=|\s+)["']?(\d+)/i)?.[1];
  const token = command.match(/--remoting-auth-token(?:=|\s+)["']?([^"'\s]+)/i)?.[1];
  if (!port || !token) return;
  return { port: Number(port), token, protocol: 'https', source: 'process' };
}

export function discoverLcuCredentials(): LcuCredentials | undefined {
  const envPort = Number(process.env.LOL_LCU_PORT || 0);
  const envToken = process.env.LOL_LCU_TOKEN;
  if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535 && envToken) {
    return {
      port: envPort,
      token: envToken,
      protocol: process.env.LOL_LCU_PROTOCOL === 'http' ? 'http' : 'https',
      source: 'env',
    };
  }

  const candidates = [
    process.env.LOL_LCU_LOCKFILE,
    process.env.LEAGUE_CLIENT_DIR ? join(process.env.LEAGUE_CLIENT_DIR, 'lockfile') : undefined,
    process.platform === 'win32' ? 'C:\\Riot Games\\League of Legends\\lockfile' : undefined,
    process.platform === 'win32' ? 'C:\\Program Files\\Riot Games\\League of Legends\\lockfile' : undefined,
    process.platform === 'darwin' ? '/Applications/League of Legends.app/Contents/LoL/lockfile' : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const path of candidates) {
    try {
      const credentials = parseLockfile(path);
      if (credentials) return credentials;
    } catch { /* try next source */ }
  }

  if (process.platform === 'win32') {
    try {
      const command = execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)",
      ], { encoding: 'utf8', timeout: 1800, windowsHide: true });
      return credentialsFromCommandLine(command);
    } catch { /* League Client is not running or process inspection is unavailable */ }
  }
}

async function lcuGet(credentials: LcuCredentials, path: string): Promise<{ status: number; data?: unknown }> {
  return new Promise((resolve, reject) => {
    const requester = credentials.protocol === 'http' ? httpRequest : httpsRequest;
    const req = requester({
      hostname: '127.0.0.1',
      port: credentials.port,
      path,
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`riot:${credentials.token}`).toString('base64')}`,
      },
      timeout: 1800,
    }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          req.destroy(new Error('LCU response too large'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!body) { resolve({ status: res.statusCode || 0 }); return; }
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(body) }); }
        catch { reject(new Error('LCU returned invalid JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('LCU request timed out')));
    req.on('error', reject);
    req.end();
  });
}

function allyForAction(action: LcuChampSelectAction, session: LcuChampSelectSession) {
  if (typeof action.isAllyAction === 'boolean') return action.isAllyAction;
  if (session.myTeam?.some(player => player.cellId === action.actorCellId)) return true;
  if (session.theirTeam?.some(player => player.cellId === action.actorCellId)) return false;
  return undefined;
}

export function mapLcuSession(session: LcuChampSelectSession, state: MatchState) {
  const expected = phases(state.draftMode, state.firstPickSide);
  const actions = (session.actions || [])
    .flat()
    .filter(action => action && ['ban', 'pick'].includes(action.type));

  const banActions = actions.filter(action => action.type === 'ban');
  const pickActions = actions.filter(action => action.type === 'pick');
  const expectedBanCount = expected.filter(phase => phase.action === 'ban').length;
  const expectedPickCount = expected.filter(phase => phase.action === 'pick').length;
  const rosterChampionCount = [...(session.myTeam || []), ...(session.theirTeam || [])]
    .filter(player => Number(player.championId || 0) > 0).length;

  if (!actions.length && rosterChampionCount === 0) {
    return {
      actions: [] as LcuMappedAction[],
      localSide: undefined as Side | undefined,
      mode: 'tournament' as LcuDraftMode,
    };
  }

  const standardCompatible = actions.length > 0
    && actions.length <= expected.length
    && actions.every((action, index) => Boolean(expected[index]) && action.type === expected[index].action);

  const phaseName = String(session.timer?.phase || '').toUpperCase();
  const practicePhase = phaseName.includes('FINAL') || phaseName.includes('PICK') || phaseName.includes('PLANNING');
  // Blind/custom-AI Champ Select often exposes only the local player's actionable
  // ban/pick entries while the actual ten selected champions live in myTeam/theirTeam.
  // Prefer the roster shape over action count whenever the action sequence is not a
  // valid tournament prefix and the client has already populated a meaningful roster.
  const pickOnlyPractice = !standardCompatible
    && expectedBanCount > 0
    && banActions.length < expectedBanCount
    && (
      rosterChampionCount >= Math.min(5, expectedPickCount)
      || pickActions.length >= expectedPickCount
      || (practicePhase && rosterChampionCount > 0)
    );

  if (!standardCompatible && !pickOnlyPractice) {
    const mismatch = actions.findIndex((action, index) => !expected[index] || action.type !== expected[index].action);
    throw new Error(
      `LCU room draft does not match tournament BP at phase ${Math.max(1, mismatch + 1)} `
      + `(LCU: ${banActions.length} ban / ${pickActions.length} pick / ${rosterChampionCount} roster; `
      + `expected: ${expectedBanCount} ban / ${expectedPickCount} pick; client: ${phaseName || 'unknown'})`
    );
  }

  const anchorIndex = actions.findIndex(action => allyForAction(action, session) !== undefined);
  const anchorRelation = anchorIndex >= 0 ? allyForAction(actions[anchorIndex], session) : undefined;
  const inferredLocalSide = anchorIndex >= 0 && anchorRelation !== undefined && expected[anchorIndex]
    ? (anchorRelation ? expected[anchorIndex].team : opposite(expected[anchorIndex].team))
    : undefined;

  if (standardCompatible) {
    return {
      mode: 'tournament' as LcuDraftMode,
      localSide: inferredLocalSide,
      actions: actions.map((action, index): LcuMappedAction => ({
        id: action.id,
        phaseIndex: index,
        side: expected[index].team,
        action: expected[index].action,
        championId: Number(action.championId || 0),
        completed: Boolean(action.completed),
      })),
    };
  }

  // In custom AI / blind-style rooms, myTeam/theirTeam are the reliable source of
  // the selected champions. LCU may expose only one local pick action plus a dummy
  // ban action even after all bots are locked. Map roster champions onto the ten
  // tournament pick slots and synthesize the missing bans as Empty Ban later.
  // Blind/AI rooms have no meaningful first-pick side. Treat the local League
  // Client roster as the currently displayed left team so practice sync follows
  // the operator's visible team layout rather than a dummy action index.
  const localSide: Side = state.displayLeftSide;
  const remoteSide = opposite(localSide);
  const pickPhaseIndexes = {
    blue: expected.map((phase, index) => ({ phase, index })).filter(item => item.phase.action === 'pick' && item.phase.team === 'blue').map(item => item.index),
    red: expected.map((phase, index) => ({ phase, index })).filter(item => item.phase.action === 'pick' && item.phase.team === 'red').map(item => item.index),
  };

  const explicitPickByCell = new Map<number, LcuChampSelectAction>();
  for (const action of pickActions) explicitPickByCell.set(action.actorCellId, action);

  const rosterForSide = (players: LcuChampSelectPlayer[], side: Side) => {
    const entries = players
      .map((player, rosterIndex) => {
        const explicit = explicitPickByCell.get(player.cellId);
        const championId = Number(player.championId || explicit?.championId || 0);
        if (championId <= 0) return undefined;
        return {
          player,
          rosterIndex,
          explicit,
          championId,
          // Bots/remote slots usually have no explicit action at all: a non-zero
          // roster champion is therefore already authoritative for this practice room.
          completed: explicit ? Boolean(explicit.completed) : true,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => Number(right.completed) - Number(left.completed) || left.rosterIndex - right.rosterIndex);

    if (entries.length > pickPhaseIndexes[side].length) {
      throw new Error(`LCU practice roster for ${side} contains more than five champions`);
    }

    return entries.map((entry, index): LcuMappedAction => ({
      id: entry.explicit?.id ?? -(side === 'blue' ? 1000 : 2000) - entry.player.cellId - index,
      phaseIndex: pickPhaseIndexes[side][index],
      side,
      action: 'pick',
      championId: entry.championId,
      completed: entry.completed,
    }));
  };

  const rosterMapped = rosterChampionCount > 0
    ? [
        ...rosterForSide(session.myTeam || [], localSide),
        ...rosterForSide(session.theirTeam || [], remoteSide),
      ].sort((left, right) => left.phaseIndex - right.phaseIndex)
    : [];

  // Some practice implementations expose team cell IDs without championId and
  // put the actual picks only in actions. Do not let those sparse roster shells
  // collapse ten action picks into one entry per actorCellId.
  if (!rosterMapped.length) {
    const used = { blue: 0, red: 0 };
    const fallbackPickIndexes = expected
      .map((phase, index) => ({ phase, index }))
      .filter(item => item.phase.action === 'pick')
      .map(item => item.index);
    let fallbackCursor = 0;
    const mapped = pickActions.map((action): LcuMappedAction => {
      const relation = allyForAction(action, session);
      let side: Side;
      let phaseIndex: number | undefined;
      if (relation !== undefined) {
        side = relation ? localSide : remoteSide;
        phaseIndex = pickPhaseIndexes[side][used[side]++];
      } else {
        phaseIndex = fallbackPickIndexes[fallbackCursor++];
        side = phaseIndex === undefined ? localSide : expected[phaseIndex].team;
      }
      if (phaseIndex === undefined) throw new Error('LCU pick-only room contains more picks than supported');
      return {
        id: action.id,
        phaseIndex,
        side,
        action: 'pick',
        championId: Number(action.championId || 0),
        completed: Boolean(action.completed),
      };
    }).sort((left, right) => left.phaseIndex - right.phaseIndex);
    return { actions: mapped, localSide, mode: 'pick-only-practice' as LcuDraftMode };
  }

  return { actions: rosterMapped, localSide, mode: 'pick-only-practice' as LcuDraftMode };
}

function currentDraftValues(state: MatchState) {
  const counters = {
    blue: { ban: 0, pick: 0 },
    red: { ban: 0, pick: 0 },
  };
  return phases(state.draftMode, state.firstPickSide).map(phase => {
    const index = counters[phase.team][phase.action]++;
    return phase.action === 'ban'
      ? state[`${phase.team}Bans`][index]
      : state[`${phase.team}Picks`][index];
  });
}

export class LcuBridge {
  private credentials?: LcuCredentials;
  private discoverAfter = 0;
  private busy = false;
  private statusValue: LcuStatus = { clientConnected: false, sessionActive: false };

  constructor(private store: Store, private onChanged: () => void) {}

  status(): LcuStatus {
    return structuredClone(this.statusValue);
  }

  private discover() {
    if (this.credentials) return this.credentials;
    if (Date.now() < this.discoverAfter) return;
    this.discoverAfter = Date.now() + 2500;
    this.credentials = discoverLcuCredentials();
    return this.credentials;
  }

  async poll() {
    if (this.busy || this.store.data.state.bpInputMode !== 'lcu') return;
    this.busy = true;
    try {
      const credentials = this.discover();
      if (!credentials) {
        this.statusValue = { clientConnected: false, sessionActive: false, lastError: 'League Client not found' };
        return;
      }

      let response: { status: number; data?: unknown };
      try {
        response = await lcuGet(credentials, '/lol-champ-select/v1/session');
        if (response.status === 404) response = await lcuGet(credentials, '/lol-lobby-team-builder/champ-select/v1/session');
      } catch (error) {
        this.credentials = undefined;
        this.statusValue = {
          clientConnected: false,
          sessionActive: false,
          lastError: error instanceof Error ? error.message : 'League Client connection failed',
        };
        return;
      }

      if (response.status === 404) {
        this.statusValue = { clientConnected: true, sessionActive: false, source: credentials.source };
        return;
      }
      if (response.status === 401 || response.status === 403) {
        this.credentials = undefined;
        this.statusValue = { clientConnected: false, sessionActive: false, lastError: 'League Client credentials changed' };
        return;
      }
      if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
        this.statusValue = {
          clientConnected: true,
          sessionActive: false,
          source: credentials.source,
          lastError: `Champ Select API returned HTTP ${response.status}`,
        };
        return;
      }

      const session = response.data as LcuChampSelectSession;
      const filteredActions = (session.actions || []).flat().filter(action => action && ['ban','pick'].includes(action.type));
      const actionSummary = {
        groups: session.actions?.length ?? 0,
        bans: filteredActions.filter(action => action.type === 'ban').length,
        picks: filteredActions.filter(action => action.type === 'pick').length,
        completedBans: filteredActions.filter(action => action.type === 'ban' && action.completed).length,
        completedPicks: filteredActions.filter(action => action.type === 'pick' && action.completed).length,
        myRoster: (session.myTeam || []).filter(player => Number(player.championId || 0) > 0).length,
        theirRoster: (session.theirTeam || []).filter(player => Number(player.championId || 0) > 0).length,
      };
      this.statusValue = {
        ...this.statusValue,
        clientConnected: true,
        sessionActive: true,
        source: credentials.source,
        phase: session.timer?.phase,
        actionSummary,
        lastError: undefined,
      };
      const state = this.store.data.state;
      const mapped = mapLcuSession(session, state);
      const expected = phases(state.draftMode, state.firstPickSide);
      const currentValues = currentDraftValues(state);

      this.statusValue = {
        ...this.statusValue,
        clientConnected: true,
        sessionActive: true,
        source: credentials.source,
        localSide: mapped.localSide,
        phase: session.timer?.phase,
        draftMode: mapped.mode,
        actionSummary,
        lastError: undefined,
      };

      const byPhase = new Map(mapped.actions.map(action => [action.phaseIndex, action]));

      // Never silently merge two different drafts. Manual fallback is safe only
      // while the already-recorded prefix matches the League Client session.
      for (let index = 0; index < state.currentPhase; index++) {
        const expectedPhase = expected[index];
        const action = byPhase.get(index);
        const localValue = currentValues[index];

        if (mapped.mode === 'pick-only-practice' && expectedPhase.action === 'ban') {
          if (localValue !== null) throw new Error(`LCU practice room differs at phase ${index + 1}`);
          continue;
        }

        if (!action || !action.completed || action.side !== expectedPhase.team || action.action !== expectedPhase.action) {
          throw new Error(`LCU draft differs at phase ${index + 1}`);
        }
        const remoteValue = action.action === 'ban' && action.championId <= 0 ? null : action.championId;
        if (localValue !== remoteValue) throw new Error(`LCU draft differs at phase ${index + 1}`);
      }

      while (this.store.data.state.currentPhase < expected.length) {
        const phaseIndex = this.store.data.state.currentPhase;
        const phase = phases(this.store.data.state.draftMode, this.store.data.state.firstPickSide)[phaseIndex];
        const action = byPhase.get(phaseIndex);
        if (!phase) break;

        if (mapped.mode === 'pick-only-practice' && phase.action === 'ban' && !action) {
          this.store.apply(
            `lcu-practice-skip-${phaseIndex}-${this.store.data.revision}`,
            this.store.data.revision,
            { type: 'skip_ban', team: phase.team },
          );
          this.statusValue.lastSyncAt = Date.now();
          this.statusValue.lastError = undefined;
          this.statusValue.lastAction = { side: phase.team, action: 'ban', championId: null };
          this.onChanged();
          continue;
        }

        if (!action?.completed) break;
        if (action.side !== phase.team || action.action !== phase.action) {
          throw new Error(`LCU phase mapping mismatch at phase ${phaseIndex + 1}`);
        }

        let storeAction: Action;
        let championId: number | null = action.championId;
        if (action.action === 'ban' && action.championId <= 0) {
          storeAction = { type: 'skip_ban', team: action.side };
          championId = null;
        } else {
          if (action.championId <= 0) break;
          storeAction = { type: 'draft_action', team: action.side, action: action.action, heroId: action.championId };
        }

        this.store.apply(
          `lcu-${action.id}-${this.store.data.revision}`,
          this.store.data.revision,
          storeAction,
        );
        this.statusValue.lastSyncAt = Date.now();
        this.statusValue.lastError = undefined;
        this.statusValue.lastAction = { side: action.side, action: action.action, championId };
        this.onChanged();
      }
    } catch (error) {
      this.statusValue.lastError = error instanceof Error ? error.message : 'LCU sync failed';
    } finally {
      this.busy = false;
    }
  }
}

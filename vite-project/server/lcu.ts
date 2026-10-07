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
  side: Side;
  action: 'ban' | 'pick';
  championId: number;
  completed: boolean;
};

export type LcuStatus = {
  clientConnected: boolean;
  sessionActive: boolean;
  source?: LcuCredentials['source'];
  localSide?: Side;
  phase?: string;
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
    .filter(action => action && ['ban', 'pick'].includes(action.type))
    .sort((left, right) => left.id - right.id);

  if (!actions.length) return { actions: [] as LcuMappedAction[], localSide: undefined as Side | undefined };

  const anchorIndex = actions.findIndex(action => allyForAction(action, session) !== undefined);
  if (anchorIndex < 0 || !expected[anchorIndex]) throw new Error('LCU side mapping is unavailable');
  const anchorAlly = allyForAction(actions[anchorIndex], session)!;
  const localSide = anchorAlly ? expected[anchorIndex].team : opposite(expected[anchorIndex].team);

  const mapped = actions.map((action, index): LcuMappedAction => {
    const relation = allyForAction(action, session);
    if (relation === undefined) throw new Error('LCU action side is unavailable');
    return {
      id: action.id,
      side: relation ? localSide : opposite(localSide),
      action: action.type as 'ban' | 'pick',
      championId: Number(action.championId || 0),
      completed: Boolean(action.completed),
    };
  });
  return { actions: mapped, localSide };
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
      const state = this.store.data.state;
      const mapped = mapLcuSession(session, state);
      const expected = phases(state.draftMode, state.firstPickSide);
      const currentValues = currentDraftValues(state);

      this.statusValue = {
        clientConnected: true,
        sessionActive: true,
        source: credentials.source,
        localSide: mapped.localSide,
        phase: session.timer?.phase,
      };

      // Never silently merge two different drafts. Manual fallback is safe only
      // while the already-recorded prefix matches the League Client session.
      for (let index = 0; index < state.currentPhase; index++) {
        const action = mapped.actions[index];
        const expectedPhase = expected[index];
        if (!action || !action.completed || action.side !== expectedPhase.team || action.action !== expectedPhase.action) {
          throw new Error(`LCU draft differs at phase ${index + 1}`);
        }
        const localValue = currentValues[index];
        const remoteValue = action.action === 'ban' && action.championId <= 0 ? null : action.championId;
        if (localValue !== remoteValue) throw new Error(`LCU draft differs at phase ${index + 1}`);
      }

      for (let index = this.store.data.state.currentPhase; index < expected.length; index++) {
        const action = mapped.actions[index];
        if (!action?.completed) break;
        const phase = phases(this.store.data.state.draftMode, this.store.data.state.firstPickSide)[this.store.data.state.currentPhase];
        if (!phase || action.side !== phase.team || action.action !== phase.action) {
          throw new Error(`LCU phase mapping mismatch at phase ${this.store.data.state.currentPhase + 1}`);
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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';

type LcuCredentials = {
  port: number;
  token: string;
  protocol: 'http' | 'https';
  source: 'env' | 'lockfile' | 'process';
};

export type LcuStatus = {
  clientConnected: boolean;
  sessionActive: boolean;
  source?: LcuCredentials['source'];
  phase?: string;
  lastSyncAt?: number;
  lastError?: string;
};

export function parseLockfile(path: string): LcuCredentials | undefined {
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

export function credentialsFromCommandLine(command: string): LcuCredentials | undefined {
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

export async function lcuGet(credentials: LcuCredentials, path: string): Promise<{ status: number; data?: unknown }> {
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

/** Credentials and local GET calls stay on the game machine; this class cannot write BP. */
export class LcuBridge {
  private credentials?: LcuCredentials;
  private discoverAfter = 0;
  private busy = false;
  private statusValue: LcuStatus = { clientConnected: false, sessionActive: false };

  constructor(private enabled = () => process.env.LOL_LCU_ENABLED === '1') {}

  status(): LcuStatus { return structuredClone(this.statusValue); }

  async poll() {
    if (this.busy || !this.enabled()) return;
    this.busy = true;
    try {
      if (!this.credentials && Date.now() >= this.discoverAfter) {
        this.discoverAfter = Date.now() + 2500;
        this.credentials = discoverLcuCredentials();
      }
      if (!this.credentials) {
        this.statusValue = { clientConnected: false, sessionActive: false, lastError: 'League Client not found' };
        return;
      }
      const response = await lcuGet(this.credentials, '/lol-gameflow/v1/gameflow-phase');
      if (response.status !== 200) throw new Error(`League Client returned HTTP ${response.status}`);
      this.statusValue = { clientConnected: true, sessionActive: response.data === 'ChampSelect' || response.data === 'InProgress',
        phase: typeof response.data === 'string' ? response.data : undefined, source: this.credentials.source, lastSyncAt: Date.now() };
    } catch (error) {
      this.credentials = undefined;
      this.statusValue = { clientConnected: false, sessionActive: false,
        lastError: error instanceof Error ? error.message : 'League Client connection failed' };
    } finally { this.busy = false; }
  }
}

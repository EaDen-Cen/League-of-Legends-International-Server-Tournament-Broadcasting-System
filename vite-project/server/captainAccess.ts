import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export type CaptainMode = 'disabled' | 'enabled' | 'paused' | 'takeover';
interface Grant { matchId: string; teamId: string; epoch: number; mode: CaptainMode; assignmentsAllowed: boolean; finalConfirmationAllowed?: boolean; hash?: string }
interface AccessData { version: 1; generation: number; grants: Grant[]; audit: { at: number; matchId: string; teamId: string; operation: string; epoch: number }[] }
export interface CaptainIdentity { role: 'captain'; matchId: string; teamId: string; hash: string }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// Authorization lives outside match snapshots: Undo and backup imports cannot restore a revoked invite.
export class CaptainAccess {
  private data: AccessData;
  constructor(private file?: string) {
    this.data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { version: 1, generation: 0, grants: [], audit: [] };
    if (this.data.version !== 1 || !Number.isSafeInteger(this.data.generation) || !Array.isArray(this.data.grants) || !Array.isArray(this.data.audit)) throw Error('队长授权存档损坏，请保留文件并恢复授权备份');
  }
  private save(next: AccessData) {
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      const fd = openSync(temporary, 'w', 0o600);
      try { writeFileSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, this.file);
    }
    this.data = next;
  }
  list(matchId: string, teamIds: string[]) {
    return teamIds.map(teamId => {
      const value = this.data.grants.find(g => g.matchId === matchId && g.teamId === teamId);
      return { teamId, epoch: value?.epoch ?? 0, mode: value?.mode ?? 'disabled' as CaptainMode, assignmentsAllowed: value?.assignmentsAllowed ?? false, finalConfirmationAllowed: value?.finalConfirmationAllowed ?? false };
    });
  }
  identify(token: unknown): CaptainIdentity | undefined {
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) return;
    const digest = hash(token);
    const grant = this.data.grants.find(g => g.hash === digest);
    return grant ? { role: 'captain', matchId: grant.matchId, teamId: grant.teamId, hash: digest } : undefined;
  }
  current(identity: CaptainIdentity) {
    const grant = this.data.grants.find(g => g.matchId === identity.matchId && g.teamId === identity.teamId && g.hash === identity.hash);
    if (!grant) throw Error('队长链接已失效，请联系导播');
    return { matchId: grant.matchId, teamId: grant.teamId, epoch: grant.epoch, mode: grant.mode, assignmentsAllowed: grant.assignmentsAllowed, finalConfirmationAllowed: grant.finalConfirmationAllowed ?? false };
  }
  change(matchId: string, teamId: string, operation: string, enabled?: boolean) {
    if (!['rotate', 'enable', 'pause', 'disable', 'takeover', 'assignments', 'confirmation'].includes(operation)) throw Error('不支持的队长权限操作');
    const next = structuredClone(this.data);
    let grant = next.grants.find(g => g.matchId === matchId && g.teamId === teamId);
    if (!grant) { grant = { matchId, teamId, epoch: 0, mode: 'disabled', assignmentsAllowed: false }; next.grants.push(grant); }
    let token: string | undefined;
    if (operation === 'rotate') { token = randomBytes(32).toString('base64url'); grant.hash = hash(token); grant.mode = 'disabled'; grant.assignmentsAllowed = false; grant.finalConfirmationAllowed = false; }
    else if (operation === 'assignments') { if (typeof enabled !== 'boolean') throw Error('归属权限开关无效'); grant.assignmentsAllowed = enabled; }
    else if (operation === 'confirmation') { if (typeof enabled !== 'boolean') throw Error('阵容确认权限开关无效'); grant.finalConfirmationAllowed = enabled; }
    else {
      if (operation === 'enable' && !grant.hash) throw Error('请先生成队长链接');
      grant.mode = operation === 'enable' ? 'enabled' : operation === 'pause' ? 'paused' : operation === 'takeover' ? 'takeover' : 'disabled';
      if (operation === 'disable') { delete grant.hash; grant.assignmentsAllowed = false; grant.finalConfirmationAllowed = false; }
    }
    grant.epoch = ++next.generation;
    next.audit.push({ at: Date.now(), matchId, teamId, operation, epoch: grant.epoch });
    this.save(next);
    return { ...(token ? { token } : {}), ...this.list(matchId, [teamId])[0] };
  }
  suspend(matchId: string, teamIds: string[]) {
    for (const teamId of teamIds) this.change(matchId, teamId, 'takeover');
  }
}

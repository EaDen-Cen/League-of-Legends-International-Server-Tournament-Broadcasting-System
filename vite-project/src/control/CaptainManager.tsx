import { useState } from 'react';
import type { MatchState } from '../shared/types';
import type { CaptainStatus } from '../shared/useMatch';
import { apiURL } from '../shared/config';

export function CaptainManager({ state, token, captains = [], disabled }: { state: MatchState; token: string; captains?: CaptainStatus[]; disabled: boolean }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const zh = state.language === 'zh';
  async function update(teamId: string, operation: string, enabled?: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiURL}/api/captains`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: state.matchId, teamId, operation, enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Permission update failed');
      if (operation === 'rotate') { setLinks(previous => ({ ...previous, [teamId]: `${location.origin}/captain#token=${encodeURIComponent(data.token)}` })); }
      setMessage(zh ? '服务器已更新权限；旧请求不能继续写入。' : 'Permissions updated by server.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  const names = { enabled: zh ? '已授权' : 'Enabled', disabled: zh ? '等待导播授权' : 'Disabled', paused: zh ? '暂停' : 'Paused', takeover: zh ? '导播接管' : 'Director takeover' };
  return <section className="panel captain-manager"><h2>{zh ? '队长终端与授权' : 'Captain terminals'}</h2>
    <p>{zh ? '链接跟随真实队伍。重新生成后旧链接和现有连接失去权限；新链接只在本面板显示。' : 'Links follow team identity. Rotating a link revokes existing credentials.'}</p>
    <div className="captain-manager-grid">{(['blue', 'red'] as const).map(side => {
      const team = state[`${side}Team`], access = captains.find(item => item.teamId === team.id);
      return <section key={team.id}><h3>{team.name}</h3><p>{names[access?.mode ?? 'disabled']} · {access?.online ?? 0} {zh ? '个连接' : 'connections'}</p>
        <div className="toolbar">
          {(['rotate', 'enable', 'pause', 'disable', 'takeover'] as const).map(operation => <button key={operation} disabled={disabled || busy} onClick={() => void update(team.id, operation)}>{({ rotate: zh ? '生成/轮换链接' : 'Rotate invite', enable: zh ? '授权操作' : 'Enable', pause: zh ? '暂停本队' : 'Pause', disable: zh ? '撤销写入' : 'Disable', takeover: zh ? '接管本队' : 'Take over' })[operation]}</button>)}
        </div>
        <label><input type="checkbox" checked={access?.assignmentsAllowed ?? false} disabled={disabled || busy} onChange={event => void update(team.id, 'assignments', event.target.checked)} />{zh ? '允许本队调整最终英雄归属' : 'Allow final assignments'}</label>
        <label><input type="checkbox" checked={access?.finalConfirmationAllowed ?? false} disabled={disabled || busy} onChange={event => void update(team.id, 'confirmation', event.target.checked)} />{zh ? '允许本队确认最终阵容' : 'Allow final lineup confirmation'}</label>
        {links[team.id] && <div className="invite-link"><input aria-label={`${team.name} invite link`} readOnly value={links[team.id]} /><button onClick={() => void navigator.clipboard.writeText(links[team.id]).then(() => setMessage(zh ? '链接已复制' : 'Link copied')).catch(() => setMessage(zh ? '请手动复制上方链接' : 'Copy the link manually'))}>{zh ? '复制链接' : 'Copy link'}</button></div>}
      </section>;
    })}</div><p role="status">{message}</p>
    <button disabled={disabled || busy} onClick={() => { void update(state.blueTeam.id, 'takeover').then(() => update(state.redTeam.id, 'takeover')); }}>{zh ? '接管双方 BP' : 'Take over both teams'}</button>
  </section>;
}

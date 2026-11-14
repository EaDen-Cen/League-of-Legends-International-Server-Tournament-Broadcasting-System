import { useState } from 'react';
import { apiURL } from '../shared/config';
export function MatchBackup({ token, disabled }: { token: string; disabled: boolean }) {
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true);
    try {
      const response = await fetch(`${apiURL}/api/backup`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Error('备份失败 / Backup failed');
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = `lol-match-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click(); URL.revokeObjectURL(url);
      setMessage('已导出比赛内容。队长权限与采集数据独立保存；采集记录请单独 JSON 导出。');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Backup failed'); }
    finally { setBusy(false); }
  }
  async function restore(file: File) {
    if (file.size > 64 * 1024 * 1024) { setMessage('备份文件最大 64 MiB / Maximum backup size: 64 MiB'); return; }
    if (!confirm('恢复将替换服务器比赛内容、暂停 BP 并撤销队长写入权限。请先导出当前备份。继续？ / Replace match data and revoke captain permissions?')) return;
    setBusy(true);
    try {
      const backup: unknown = JSON.parse(await file.text());
      const response = await fetch(`${apiURL}/api/restore`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ backup }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Restore failed');
      setMessage('恢复成功；请检查本局、规则和资料后重新授权队长并恢复 BP。');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Restore failed'); }
    finally { setBusy(false); }
  }
  return <details className="panel"><summary>比赛备份与恢复 / Backup and restore</summary><div className="toolbar"><button disabled={disabled || busy} onClick={() => void backup()}>导出比赛备份 / Export backup</button><label className="upload-label">恢复 JSON 备份 / Restore<input type="file" accept=".json,application/json" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ''; }} /></label></div><p role="status">{message}</p></details>;
}

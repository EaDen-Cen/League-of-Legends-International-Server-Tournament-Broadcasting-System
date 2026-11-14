import { useState } from 'react';
import type { Action, GameRules, MatchState, SeriesRules } from '../shared/types';
import { gameRulesFor, gameRulesLocked, legacyGameRules } from '../shared/gameRules';

export function GameRulesManager({ state, send, disabled }: { state: MatchState; send: (action: Action) => void; disabled: boolean }) {
  const zh = state.language === 'zh';
  const [plan, setPlan] = useState<SeriesRules>(() => structuredClone(state.seriesRules ?? { defaultGameRules: legacyGameRules(state), games: {} }));
  const [target, setTarget] = useState('default');
  const game = Number(target);
  const rules = target === 'default' ? plan.defaultGameRules : { ...plan.defaultGameRules, ...plan.games[target] };
  // Defaults can change future games; freeze every started game's effective rules.
  function update(patch: Partial<GameRules>) {
    setPlan(previous => {
      const next = structuredClone(previous);
      if (target === 'default') {
        next.defaultGameRules = { ...next.defaultGameRules, ...patch };
        for (let i = 1; i <= Number(state.seriesFormat.slice(2)); i++) {
          if (gameRulesLocked(state, i)) next.games[String(i)] = gameRulesFor(state, i);
        }
      } else next.games[target] = { ...rules, ...patch };
      return next;
    });
  }
  const locked = disabled || (target !== 'default' && gameRulesLocked(state, game));
  return <details className="panel game-rules-manager"><summary>{zh ? '逐局规则管理' : 'Game Rules Manager'}</summary>
    <p className="muted">{zh ? '系列默认 + 单局覆盖。已开始或完成的对局锁定；保存后自动用于对应局。' : 'Series defaults with per-game overrides. Started games are locked; saved rules apply automatically.'}</p>
    <label>{zh ? '编辑范围' : 'Edit scope'}<select value={target} onChange={e => setTarget(e.target.value)}>
      <option value="default">{zh ? '系列默认' : 'Series defaults'}</option>
      {Array.from({ length: Number(state.seriesFormat.slice(2)) }, (_, i) => <option key={i} value={i + 1}>Game {i + 1}{gameRulesLocked(state, i + 1) ? ' 🔒' : plan.games[String(i + 1)] ? ' *' : ''}</option>)}
    </select></label>
    <fieldset disabled={locked} className="match-settings-grid">
      <label>{zh ? 'BP 流程' : 'Draft sequence'}<select value={rules.draftMode} onChange={e => update({ draftMode: e.target.value as GameRules['draftMode'] })}><option value="match">Tournament · 5 bans</option><option value="normal">Practice · 2 bans</option></select></label>
      <label>{zh ? '跨局限制' : 'History restrictions'}<select value={rules.draftRuleMode} onChange={e => update({ draftRuleMode: e.target.value as GameRules['draftRuleMode'] })}><option value="normal">Normal</option><option value="global">Team Fearless</option><option value="player">Player Fearless</option></select></label>
      <label>{zh ? '先手方' : 'First pick'}<select value={rules.firstPickSide} onChange={e => update({ firstPickSide: e.target.value as GameRules['firstPickSide'] })}><option value="blue">Blue</option><option value="red">Red</option></select></label>
      <label>{zh ? '换边展示' : 'Side swap display'}<select value={rules.sideSwapMode} onChange={e => update({ sideSwapMode: e.target.value as GameRules['sideSwapMode'] })}><option value="moveTeams">{zh ? '队伍随阵营移动' : 'Move teams'}</option><option value="colorsOnly">{zh ? '保持队伍左右位置' : 'Keep team positions'}</option></select></label>
      <label><input type="checkbox" checked={rules.enforcePreviousHistory} onChange={e => update({ enforcePreviousHistory: e.target.checked })} />{zh ? '应用此前对局英雄限制' : 'Enforce previous history'}</label>
      <label><input type="checkbox" checked={rules.contributeToFutureHistory} onChange={e => update({ contributeToFutureHistory: e.target.checked })} />{zh ? '本局英雄计入后续限制' : 'Contribute to future history'}</label>
    </fieldset>
    {target !== 'default' && <button disabled={locked} onClick={() => setPlan(previous => { const next = structuredClone(previous); delete next.games[target]; return next; })}>{zh ? '恢复系列默认' : 'Use series defaults'}</button>}
    <button disabled={disabled} onClick={() => send({ type: 'series_rules', rules: plan })}>{zh ? '保存逐局规则' : 'Save game rules'}</button>
    {state.seriesRules && <button disabled={disabled || state.currentPhase > 0 || !!state.committedGameId || state.draftHistory.length > 0} onClick={() => send({ type: 'clear_series_rules' })}>{zh ? '停用逐局计划（保留当前规则）' : 'Disable plan (keep current rules)'}</button>}
  </details>;
}

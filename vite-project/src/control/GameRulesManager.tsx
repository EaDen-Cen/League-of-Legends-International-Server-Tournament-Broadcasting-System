import { useState } from 'react';
import type { Action, DraftStage, GameRules, MatchState, SeriesRules, Side } from '../shared/types';
import { gameRulesFor, gameRulesLocked, legacyGameRules, validateGameRules, draftPhases } from '../shared/gameRules';

export function GameRulesManager({ state, send, disabled }: { state: MatchState; send: (action: Action) => void; disabled: boolean }) {
  const zh = state.language === 'zh';
  const [plan, setPlan] = useState<SeriesRules>(() => structuredClone(state.seriesRules ?? { defaultGameRules: legacyGameRules(state), games: {} }));
  const [current, setCurrent] = useState(() => structuredClone(state.currentGameRules ?? legacyGameRules(state)));
  const [target, setTarget] = useState('current');
  const [blueBans, setBlueBans] = useState(() => draftPhases(state).filter(phase => phase.team === 'blue' && phase.action === 'ban').reduce((sum, phase) => sum + phase.count, 0)), [redBans, setRedBans] = useState(() => draftPhases(state).filter(phase => phase.team === 'red' && phase.action === 'ban').reduce((sum, phase) => sum + phase.count, 0));
  const [message, setMessage] = useState('');
  const rules = target === 'current' ? current : target === 'default' ? plan.defaultGameRules : { ...plan.defaultGameRules, ...plan.games[target] };
  const stages = rules.stages ?? draftPhases({ ...state, currentGameRules: rules }).map(({ team, action, count }) => ({ team, action, count }));
  const locked = disabled || (target === 'current' ? state.currentPhase > 0 && !state.bpPaused : target !== 'default' && gameRulesLocked(state, Number(target)));
  function update(patch: Partial<GameRules>) {
    if (target === 'current') { setCurrent(previous => ({ ...previous, ...patch })); return; }
    setPlan(previous => {
      const next = structuredClone(previous);
      if (target === 'default') {
        next.defaultGameRules = { ...next.defaultGameRules, ...patch };
        for (let i = 1; i <= Number(state.seriesFormat.slice(2)); i++) if (gameRulesLocked(state, i)) next.games[String(i)] = gameRulesFor(state, i);
      } else next.games[target] = { ...rules, ...patch };
      return next;
    });
  }
  function template() {
    const stages: DraftStage[] = [], first = rules.firstPickSide, second: Side = first === 'blue' ? 'red' : 'blue';
    for (let i = 0; i < Math.max(blueBans, redBans); i++) for (const team of [first, second]) if (i < (team === 'blue' ? blueBans : redBans)) stages.push({ team, action: 'ban', count: 1 });
    for (let i = 0; i < 5; i++) for (const team of [first, second]) stages.push({ team, action: 'pick', count: 1 });
    update({ stages });
  }
  function save() {
    try {
      if (target === 'current') { validateGameRules(current); send({ type: 'current_rules', rules: current }); }
      else { validateGameRules(rules); send({ type: 'series_rules', rules: plan }); }
      setMessage(zh ? '已提交，等待服务器校验确认。' : 'Submitted for server validation.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid rules'); }
  }
  return <details className="panel game-rules-manager"><summary>{zh ? '规则与阶段配置（每队 0–5 Ban）' : 'Rules and stages (0–5 bans)'}</summary>
    <p>{zh ? '正式 Ban 数与顺序由导播设置；已开始的当前局先暂停再修改。0 Ban 仍记录双方五个英雄。' : 'Configure bans and order before play. Pause a started game before editing. Zero bans still records ten picks.'}</p>
    <label>{zh ? '编辑范围' : 'Scope'}<select value={target} onChange={event => setTarget(event.target.value)}><option value="current">{zh ? '当前局' : 'Current game'}</option><option value="default">{zh ? '系列默认' : 'Series defaults'}</option>{Array.from({ length: Number(state.seriesFormat.slice(2)) }, (_, index) => <option key={index} value={index + 1}>Game {index + 1}{gameRulesLocked(state, index + 1) ? ' 🔒' : ''}</option>)}</select></label>
    <fieldset disabled={locked}>
      <div className="match-settings-grid">
        <label>{zh ? '跨局限制' : 'History restrictions'}<select value={rules.draftRuleMode} onChange={event => update({ draftRuleMode: event.target.value as GameRules['draftRuleMode'] })}><option value="normal">{zh ? '关闭' : 'Off'}</option><option value="global">Team Fearless</option><option value="player">Player Fearless</option></select></label>
        <label>{zh ? '先手方' : 'First team'}<select value={rules.firstPickSide} onChange={event => update({ firstPickSide: event.target.value as Side })}><option value="blue">Blue</option><option value="red">Red</option></select></label>
        <label>{zh ? '蓝方 Ban 数' : 'Blue bans'}<input type="number" min={0} max={5} value={blueBans} onChange={event => setBlueBans(Math.max(0, Math.min(5, Number(event.target.value))))} /></label>
        <label>{zh ? '红方 Ban 数' : 'Red bans'}<input type="number" min={0} max={5} value={redBans} onChange={event => setRedBans(Math.max(0, Math.min(5, Number(event.target.value))))} /></label>
      </div>
      <button onClick={template}>{zh ? '生成公开轮流模板' : 'Generate alternating template'}</button>
      <label><input type="checkbox" checked={rules.enforcePreviousHistory} onChange={event => update({ enforcePreviousHistory: event.target.checked })} />{zh ? '应用此前限制' : 'Enforce previous history'}</label>
      <label><input type="checkbox" checked={rules.contributeToFutureHistory} onChange={event => update({ contributeToFutureHistory: event.target.checked })} />{zh ? '本局计入后续限制' : 'Contribute to future history'}</label>
      <label><input type="checkbox" checked={rules.allowDuplicates ?? false} onChange={event => update({ allowDuplicates: event.target.checked })} />{zh ? '允许同局重复英雄（明确的赛事例外）' : 'Allow duplicate champions (tournament exception)'}</label>
      <label>{zh ? '可用英雄池（Riot 数字 ID，逗号分隔；留空为完整名单）' : 'Champion pool (Riot IDs, comma separated; empty for all)'}<input value={rules.heroPool?.join(',') ?? ''} onChange={event => update({ heroPool: event.target.value.trim() ? event.target.value.split(',').map(value => Number(value.trim())) : undefined })} /></label>
      <ol className="draft-stage-editor">{stages.map((stage, index, stages) => <li key={index}>
        <select aria-label={`Stage ${index + 1} team`} value={stage.team} onChange={event => update({ stages: stages.map((item, i) => i === index ? { ...item, team: event.target.value as Side } : item) })}><option value="blue">Blue</option><option value="red">Red</option></select>
        <select aria-label={`Stage ${index + 1} action`} value={stage.action} onChange={event => update({ stages: stages.map((item, i) => i === index ? { ...item, action: event.target.value as 'ban' | 'pick' } : item) })}><option value="ban">Ban</option><option value="pick">Pick</option></select>
        <select aria-label={`Stage ${index + 1} count`} value={stage.count} onChange={event => update({ stages: stages.map((item, i) => i === index ? { ...item, count: Number(event.target.value) as 1 | 2 } : item) })}><option value={1}>1</option><option value={2}>2</option></select>
        <button aria-label={`Remove stage ${index + 1}`} onClick={() => update({ stages: stages.filter((_, i) => i !== index) })}>×</button>
      </li>)}</ol>
      <button onClick={() => update({ stages: [...stages, { team: 'blue', action: 'pick', count: 1 }] })}>{zh ? '增加阶段' : 'Add stage'}</button>
    </fieldset>
    <button className="primary" disabled={locked} onClick={save}>{zh ? '校验并保存规则' : 'Validate and save rules'}</button><p role="status">{message}</p>
  </details>;
}

import { useEffect, useState } from 'react';
import './broadcast.css';
import './BroadcastApp.css';
import './manualDraft.css';
import { heroForState } from './shared/heroData';
import type { Action, Language, MatchSettings, MatchState, Role, Side } from './shared/types';
import { useMatch } from './shared/useMatch';
import { draftPhases } from './shared/gameRules';
import { connectionLabel, phaseName, seriesName, stageName } from './shared/display';
import { translator } from './shared/i18n';
import { errorMessage } from './shared/errorMessages';
import { currentGame, displaySides, normalizeState, ruleLocked } from './shared/draftRules';
import { portraitAssetURL } from './shared/config';
import { TeamLibrary } from './control/TeamLibrary';
import { PortraitField } from './control/PortraitField';
import { ControlHeroPicker } from './control/ControlHeroPicker';
import { ControlDraftWorkspace } from './control/ControlDraftWorkspace';
import { SettingsDialog } from './control/SettingsDialog';
import { TeamSettingsDialog } from './control/TeamSettingsDialog';
import { HeroArtEditorDialog } from './control/HeroArtEditorDialog';
import { LineupAssignments } from './control/LineupAssignments';
import { Score } from './shared/Score';
import { DraftHistory } from './shared/DraftHistory';
import { DraftLifecycle } from './control/DraftLifecycle';
import { DraftOverlay } from './overlay/DraftOverlay';
import { PreflightStatus } from './control/PreflightStatus';
import { GameRulesManager } from './control/GameRulesManager';
import { CaptainManager } from './control/CaptainManager';
import { DraftCorrection } from './control/DraftCorrection';
import { TelemetryPanel } from './control/TelemetryPanel';
import { GameHud } from './overlay/GameHud';
import { MatchBackup } from './control/MatchBackup';

function Board({ state, compact = false }: { state: MatchState; compact?: boolean }) {
  const phases = draftPhases(state), phase = phases[state.currentPhase], zh = state.language === 'zh';
  return <section className={`board ${compact ? 'compact-board' : ''}`}>
    <div className="match-strip"><span>{stageName(state.stage, state.language)}</span><span>Game {currentGame(state)} · {seriesName(state.seriesFormat, state.language)}</span></div>
    <div className="team-grid">{displaySides(state).map(side => <section key={state[`${side}Team`].id} className={`team ${side} ${phase?.team === side ? 'active' : ''}`}>
      <header>{state[`${side}Team`].logo && <img className="logo" src={portraitAssetURL(state[`${side}Team`].logo)} alt="" />}<h2>{state[`${side}Team`].name}</h2><Score state={state} side={side} /></header>
      {(['pick', 'ban'] as const).map(action => <div className={action === 'pick' ? 'picks' : 'bans'} key={action}>
        {phases.filter(step => step.team === side && step.action === action).flatMap(step => step.slots).map(slotId => {
          const slot = state.draftSlots[slotId], hero = slot?.status === 'selected' && slot.heroId ? heroForState(state, slot.heroId) : undefined;
          return <div key={slotId} data-slot-id={slotId} data-slot-status={slot?.status ?? 'empty'} className={`hero-slot ${action === 'ban' ? 'ban' : ''} ${slot?.status === 'skipped' ? 'skipped-ban' : ''}`}>
            {hero ? <><img src={portraitAssetURL(hero.imageLink)} alt={zh ? hero.chineseName : hero.englishName} /><span>{zh ? hero.chineseName : hero.englishName}</span></> : <span className="empty">{slot?.status === 'skipped' ? (zh ? '空 Ban' : 'Skip') : '—'}</span>}
          </div>;
        })}
      </div>)}
    </section>)}</div><footer className="phase">{state.bpPaused ? (zh ? 'BP 已暂停' : 'Draft paused') : phaseName(state)}</footer>
  </section>;
}

const settingsFromState = (state: MatchState): MatchSettings => ({
  blueTeam: state.blueTeam,
  redTeam: state.redTeam,
  blueScore: state.blueScore,
  redScore: state.redScore,
  gameNumber: state.gameNumber,
  seriesFormat: state.seriesFormat,
  stage: state.stage,
  draftMode: state.draftMode,
  draftRuleMode: state.draftRuleMode,
  flowbornFormsIndependent: state.flowbornFormsIndependent,
  firstPickSide: state.firstPickSide,
  sideSwapMode: state.sideSwapMode,
  language: state.language,
  overlayLayout: state.overlayLayout,
  scoreDisplay: state.scoreDisplay,
  bpInputMode: state.bpInputMode,
  roleIconStyle: state.roleIconStyle,
  roleIconBackground: state.roleIconBackground,
  showHeroName: state.showHeroName,
  artSourceMode: state.artSourceMode,
});

function MatchSettingsPanel({ state, send, disabled }: { state: MatchState; send: (a: Action) => void; disabled: boolean }) {
  const t = translator(state.language);
  const [form, setForm] = useState<MatchSettings>(() => settingsFromState(state));
  const firstPickLocked = state.currentPhase > 0 || !!state.seriesRules;
  return <form className="panel settings match-settings-panel" onSubmit={event => {
    event.preventDefault();
    send({ type: 'settings', settings: {
      ...form,
      blueTeam: state.blueTeam,
      redTeam: state.redTeam,
      blueScore: state.blueScore,
      redScore: state.redScore,
      gameNumber: state.gameNumber,
    } });
  }}>
    <div className="match-settings-grid">
      <section><h3>{t('matchDisplay')}</h3>
        <label>{t('stage')}<input maxLength={80} value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} /></label>
        <label>{t('seriesFormat')}<select disabled={state.draftHistory.length > 0} value={form.seriesFormat} onChange={e => setForm({ ...form, seriesFormat: e.target.value as MatchSettings['seriesFormat'] })}>
          {(['BO1', 'BO3', 'BO5', 'BO7'] as const).map(format => <option key={format} value={format}>{seriesName(format, state.language)}</option>)}
        </select></label>
        <label>{t('currentGame')}<div className="readonly-field">{t('gameNumber', { number: state.gameNumber })} · {t('automatic')}</div></label>
        <label>{t('draftMode')}<select disabled={state.currentPhase > 0 || !!state.seriesRules} value={form.draftMode} onChange={e => setForm({ ...form, draftMode: e.target.value as MatchSettings['draftMode'] })}>
          <option value="match">{t('matchMode')}</option><option value="normal">{t('normalMode')}</option>
        </select></label>
        <label>{t('draftRules')}<select aria-label={t('draftRules')} disabled={ruleLocked(state) || !!state.seriesRules} value={form.draftRuleMode} onChange={e => setForm({ ...form, draftRuleMode: e.target.value as MatchSettings['draftRuleMode'] })}>
          <option value="normal">{t('ruleNormal')}</option><option value="player">{t('rulePlayer')}</option><option value="global">{t('ruleGlobal')}</option>
        </select></label>
        {ruleLocked(state) && <p className="muted">{t('rulesLocked')}</p>}
      </section>
      <section><h3>{t('matchSettings')}</h3>
        <label>{t('firstPickSide')}<select aria-label={t('firstPickSide')} disabled={firstPickLocked} value={form.firstPickSide} onChange={e => setForm({ ...form, firstPickSide: e.target.value as Side })}>
          <option value="blue">{t('blueSide')}</option><option value="red">{t('redSide')}</option>
        </select></label>
        <label>{t('sideSwapMode')}<select disabled={!!state.seriesRules} aria-label={t('sideSwapMode')} value={form.sideSwapMode} onChange={e => setForm({ ...form, sideSwapMode: e.target.value as MatchSettings['sideSwapMode'] })}>
          <option value="moveTeams">{t('moveTeams')}</option><option value="colorsOnly">{t('colorsOnly')}</option>
        </select></label>
        <label>{t('language')}<select aria-label={t('language')} value={form.language} onChange={e => setForm({ ...form, language: e.target.value as Language })}>
          <option value="zh">{t('chinese')}</option><option value="eng">{t('english')}</option>
        </select><small>{t('languageHint')}</small></label>
        <label>{t('scoreDisplay')}<select value={form.scoreDisplay || 'number'} onChange={e => setForm({ ...form, scoreDisplay: e.target.value as MatchSettings['scoreDisplay'] })}><option value="number">{t('scoreNumber')}</option><option value="boxes">{t('scoreBoxes')}</option></select></label>
        <label>{t('overlayLayout')}<select value={form.overlayLayout} onChange={e => setForm({ ...form, overlayLayout: e.target.value as MatchSettings['overlayLayout'] })}>
          <option value="panel">{t('panelLayout')}</option><option value="side">{t('sideLayout')}</option>
        </select></label>
        <label>{t('heroImageSource')}<select value={form.artSourceMode} onChange={e => setForm({ ...form, artSourceMode: e.target.value as MatchSettings['artSourceMode'] })}>
          <option value="auto">{t('heroImageAuto')}</option><option value="legacy">{t('heroImageLegacy')}</option>
        </select></label>
        <label className="settings-checkbox"><span>{t('showHeroName')}</span><input type="checkbox" checked={form.showHeroName} onChange={e => setForm({ ...form, showHeroName: e.target.checked })} /><small>{t('showHeroNameHint')}</small></label>
      </section>
    </div>
    <button disabled={disabled} className="primary">{t('saveSettings')}</button>
  </form>;
}

function TeamSettingsPanel({ state, send, disabled, token }: { state: MatchState; send: (a: Action) => void; disabled: boolean; token: string }) {
  const t = translator(state.language);
  const [form, setForm] = useState<MatchSettings>(() => settingsFromState(state));
  const [uploads, setUploads] = useState<Set<string>>(() => new Set());
  return <form className="panel settings team-settings-panel" onSubmit={event => {
    event.preventDefault();
    if (uploads.size) return;
    send({ type: 'settings', settings: {
      ...settingsFromState(state),
      blueTeam: form.blueTeam,
      redTeam: form.redTeam,
      blueScore: state.blueScore,
      redScore: state.redScore,
      gameNumber: state.gameNumber,
    } });
  }}>
    <TeamLibrary onRosterApply={(side,index,player) => setForm(previous => {const key = side === 'blue' ? 'blueTeam' : 'redTeam';const team=previous[key];return {...previous,[key]:{...team,playerIds:team.players.map((_,i) => i === index ? player.id : team.playerIds?.[i] ?? `${team.id}-p${i+1}`),players:team.players.map((p,i) => i === index ? player.name : p),playerRoles:team.playerRoles.map((r,i) => i === index ? player.role : r),playerPortraits:team.playerPortraits.map((p,i) => i === index ? player.portrait : p)}};})} state={state} form={form} token={token} disabled={disabled || uploads.size > 0} send={send} />
    <div className="settings-grid team-settings-grid">
      {displaySides(state).map(side => {
        const teamKey = side === 'blue' ? 'blueTeam' : 'redTeam';
        const updateTeam = (patch: Partial<MatchState['blueTeam']>) => setForm(previous => ({ ...previous, [teamKey]: { ...previous[teamKey], ...patch } }));
        return <section key={side}>
          <h3>{t(teamKey)}</h3>
          <label>{t('teamName')}<input required maxLength={60} value={form[teamKey].name} onChange={e => updateTeam({ name: e.target.value })} /></label>
          <label>{t('logoAddress')}<input maxLength={1000} placeholder={t('logoPlaceholder')} value={form[teamKey].logo} onChange={e => updateTeam({ logo: e.target.value })} /></label>
          <b>{t('players')}</b>
          {form[teamKey].players.map((player, index) => <div className="player-setting-row" key={index}>
            <label>{t('playerNumber', { number: index + 1 })}<input maxLength={40} disabled={disabled} value={player} onChange={e => updateTeam({ players: form[teamKey].players.map((p, i) => i === index ? e.target.value : p) })} /></label>
            <div className="seat-label"><span>P{index + 1}</span><button type="button" disabled={disabled} onClick={() => { if (confirm(state.language === 'zh' ? '这是更换为另一位选手（生成新身份），不是修改显示名。原身份的跨局记录仍保留。继续？' : 'Replace this player identity? Renaming alone preserves the existing identity and history.')) updateTeam({ playerIds: form[teamKey].players.map((_, i) => i === index ? crypto.randomUUID() : form[teamKey].playerIds?.[i] ?? `${form[teamKey].id}-p${i + 1}`) }); }}>{state.language === 'zh' ? '更换选手身份' : 'Replace player identity'}</button></div>
            <PortraitField value={form[teamKey].playerPortraits[index]} token={token} lang={state.language} disabled={disabled}
              onChange={url => setForm(previous => ({...previous,[teamKey]:{...previous[teamKey],playerPortraits:previous[teamKey].playerPortraits.map((p,i) => i === index ? url : p)}}))}
              onBusy={busy => setUploads(previous => { const next = new Set(previous); if(busy) next.add(`${side}-${index}`); else next.delete(`${side}-${index}`); return next; })} />
          </div>)}
        </section>;
      })}
    </div>
    <button disabled={disabled || uploads.size > 0} className="primary">{t('saveSettings')}</button>
  </form>;
}
function initialToken(role: Role) {
  const fragment = new URLSearchParams(location.hash.slice(1)).get('token');
  if (fragment) { sessionStorage.setItem(`lol-${role}`, fragment); history.replaceState(null, '', location.pathname); }
  return fragment || sessionStorage.getItem(`lol-${role}`) || (import.meta.env.DEV && role !== 'captain' ? `local-${role}` : '');
}
export default function BroadcastApp() {
  const removed = location.pathname === '/caster';
  const role: Role = location.pathname === '/captain' ? 'captain' : location.pathname.startsWith('/overlay/') || removed ? 'overlay' : 'control';
  const [token, setToken] = useState(() => removed ? '' : initialToken(role));
  const [tokenInput, setTokenInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showHeroArtEditor, setShowHeroArtEditor] = useState(false);
  const { snapshot, status, error, pending, send, acknowledged } = useMatch(role, token);
  const connected = status === 'Connected';
  const state = snapshot?.state ? normalizeState(snapshot.state) : undefined;
  const lang = state?.language ?? 'zh', zh = lang === 'zh', t = translator(lang);
  const disabled = !connected || pending || !state;
  useEffect(() => { document.documentElement.lang = zh ? 'zh-CN' : 'en'; document.title = t('appName'); }, [lang, zh, t]);
  if (removed) return <main className="login panel"><h1>页面已停用 / Page removed</h1></main>;
  if (role === 'overlay') return <main className="overlay">{state && (location.pathname === '/overlay/ghud' ? <GameHud state={state} token={token} /> : <DraftOverlay state={state} />)}</main>;
  if (!token || ['Invalid token', 'Access rejected'].includes(status)) {
    if (role === 'captain') return <main className="login panel"><h1>{zh ? '队长链接缺失或已失效' : 'Captain invitation is missing or revoked'}</h1><p>{zh ? '请使用导播为本队新生成的链接。' : 'Open the latest invitation supplied by the director.'}</p></main>;
    return <main className="login panel"><h1>{t('controlLogin')}</h1><form onSubmit={event => { event.preventDefault(); sessionStorage.setItem('lol-control', tokenInput); setToken(tokenInput); }}><label>{t('accessToken')}<input type="password" required value={tokenInput} onChange={event => setTokenInput(event.target.value)} /></label><button className="primary">{t('connect')}</button></form><p>{connectionLabel(status, lang)}</p></main>;
  }
  const captain = snapshot?.captain, phase = state && draftPhases(state)[state.currentPhase];
  const ownSide = state && (['blue', 'red'] as const).find(side => state[`${side}Team`].id === captain?.teamId);
  const captainReason = !connected ? (zh ? '断线，无法提交' : 'Disconnected; submissions disabled')
    : pending ? (zh ? '提交中，等待服务器确认' : 'Submitting; waiting for server')
      : captain?.mode === 'takeover' ? (zh ? '导播已接管本队' : 'Director has taken over')
        : captain?.mode === 'paused' ? (zh ? '本队权限已暂停' : 'Team permission paused')
          : captain?.mode !== 'enabled' ? (zh ? '等待导播授权' : 'Waiting for director authorization')
            : state?.bpPaused ? (zh ? 'BP 暂停' : 'Draft paused')
              : state?.draftComplete ? (zh ? 'BP 完成，正式选择已锁定' : 'Draft complete; selections locked')
                : phase?.team !== ownSide ? (zh ? '等待对方确认' : 'Waiting for the other team') : '';
  return <main className={`workspace ${role === 'control' ? 'control-workspace' : 'captain-workspace'}`}>
    <header className="topbar"><div><span className="eyebrow">{role === 'captain' ? (zh ? '队长终端' : 'CAPTAIN') : t('controlEyebrow')}</span><h1>{role === 'captain' && state && ownSide ? state[`${ownSide}Team`].name : t('brandTitle')}</h1></div><div className="toolbar"><b className={connected ? 'status live' : 'status'}>{connectionLabel(status, lang)}</b><button onClick={() => { sessionStorage.removeItem(`lol-${role}`); setToken(''); }}>{t('logout')}</button></div></header>
    {!connected && <p className="notice">{t('disconnectedNotice')}</p>}{error && <p role="alert" className="error">{errorMessage(error, lang)}</p>}
    {state ? role === 'captain' ? <>
      <Board state={state} compact /><p className="notice" role="status">{captainReason || (zh ? '轮到己方：点击英雄预选，再确认提交。' : 'Your turn: preview champions, then confirm.')}</p>
      <ControlHeroPicker key={`${state.gameId}-${captain?.epoch}`} state={state} disabled={disabled} send={send} acknowledged={acknowledged} readOnlyReason={captainReason} captain />
      {captain?.assignmentsAllowed && <LineupAssignments state={state} disabled={disabled || captain.mode !== 'enabled' || state.bpPaused || !!state.committedGameId} send={send} teamId={captain.teamId} />}
      {state.draftComplete && ownSide && <section className="panel"><h2>{zh ? '最终阵容确认' : 'Final lineup confirmation'}</h2><p>{state.lineupConfirmedTeamIds?.includes(captain?.teamId ?? '') ? (zh ? '本队已确认' : 'Team confirmed') : (zh ? '本队尚未确认' : 'Team awaiting confirmation')}</p><button disabled={disabled || state.bpPaused || !!state.committedGameId || captain?.mode !== 'enabled' || !captain.finalConfirmationAllowed || state.lineupConfirmedTeamIds?.includes(captain.teamId)} onClick={() => send({ type: 'confirm_lineup', team: ownSide })}>{zh ? '确认本队最终阵容' : 'Confirm final lineup'}</button>{!captain?.finalConfirmationAllowed && <p>{zh ? '等待导播开放最终确认权限' : 'Waiting for director to enable confirmation'}</p>}</section>}
    </> : <>
      <ControlDraftWorkspace monitor={<>
        <Board state={state} compact />
        <section className="operator-bar panel"><div className="toolbar">
          <button disabled={disabled} onClick={() => send({ type: 'pause_draft', paused: !state.bpPaused })}>{state.bpPaused ? (zh ? '校验并恢复 BP' : 'Validate and resume BP') : (zh ? '暂停 BP' : 'Pause BP')}</button>
          <button disabled={disabled || !snapshot?.canUndo} onClick={() => send({ type: 'undo' })}>{t('undo')}</button>
          <button disabled={disabled} onClick={() => confirm(t('confirmResetDraft')) && send({ type: 'reset_draft' })}>{t('resetDraft')}</button>
          <button className="danger" disabled={disabled} onClick={() => confirm(t('confirmResetMatch')) && send({ type: 'reset_match' })}>{t('resetMatch')}</button>
          <button disabled={disabled} onClick={() => send({ type: 'swap_display' })}>{zh ? '交换屏幕左右' : 'Swap display sides'}</button>
          <button onClick={() => setShowSettings(true)}>{t('matchSettings')}</button><button onClick={() => setShowTeamSettings(true)}>{t('teamSettings')}</button><button onClick={() => setShowHeroArtEditor(true)}>{t('heroImageSettings')}</button>
          <button disabled={disabled || state.draftComplete} onClick={() => send({ type: 'advance_draft' })}>{zh ? '推进已补齐步骤' : 'Advance filled step'}</button>
        </div></section>
        <CaptainManager key={state.matchId} state={state} token={token} captains={snapshot?.captains} disabled={disabled} />
        <DraftCorrection key={state.gameId} state={state} disabled={disabled} send={send} />
        <GameRulesManager key={JSON.stringify([state.seriesRules, state.currentGameRules, state.gameId])} state={state} send={send} disabled={disabled} />
        <PreflightStatus state={state} connected={connected} /><DraftLifecycle state={state} send={send} disabled={disabled} />
        {showSettings && <SettingsDialog label={t('matchSettings')} closeLabel={t('hideSettings')} onClose={() => setShowSettings(false)}><MatchSettingsPanel key={JSON.stringify([state.seriesFormat, state.stage, state.language, state.overlayLayout])} state={state} send={send} disabled={disabled} /></SettingsDialog>}
      </>}><ControlHeroPicker state={state} disabled={disabled} send={send} acknowledged={acknowledged} /></ControlDraftWorkspace>
      <LineupAssignments state={state} disabled={disabled} send={send} />
      <MatchBackup token={token} disabled={disabled} /><TelemetryPanel key={state.matchId} state={state} token={token} disabled={disabled} />
      <DraftHistory state={state} />
      {showTeamSettings && <TeamSettingsDialog label={t('teamSettings')} closeLabel={t('closeTeamSettings')} onClose={() => setShowTeamSettings(false)}><TeamSettingsPanel key={JSON.stringify([state.blueTeam, state.redTeam])} state={state} send={send} disabled={disabled} token={token} /></TeamSettingsDialog>}
      {showHeroArtEditor && <HeroArtEditorDialog state={state} send={send} disabled={disabled} onClose={() => setShowHeroArtEditor(false)} />}
    </> : <section className="panel"><h2>{t('connectingServer')}</h2></section>}
    <footer className="page-footer">{t('communitySystem')} · {role === 'captain' ? (zh ? '服务器确认后生效' : 'Server-confirmed selections') : t('serverFooter')}</footer>
  </main>;
}

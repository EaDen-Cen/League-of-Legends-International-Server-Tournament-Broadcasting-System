import { useEffect, useState } from 'react';
import './broadcast.css';
import './BroadcastApp.css';
import { heroForState } from './shared/heroData';
import {
  phases,
  type Action,
  type Language,
  type MatchSettings,
  type MatchState,
  type Role,
  type Side,
} from './shared/types';
import { useMatch } from './shared/useMatch';
import { connectionLabel, phaseName, seriesName, stageName, teamName, draftRuleName } from './shared/display';
import { translator } from './shared/i18n';
import { errorMessage } from './shared/errorMessages';
import { currentGame, displaySides, normalizeState, ruleLocked } from './shared/draftRules';
import { TeamLibrary } from './control/TeamLibrary';
import { PortraitField } from './control/PortraitField';
import { ControlHeroPicker } from './control/ControlHeroPicker';
import { ControlDraftWorkspace } from './control/ControlDraftWorkspace';
import { SettingsDialog } from './control/SettingsDialog';
import { TeamSettingsDialog } from './control/TeamSettingsDialog';
import { ScreenInput } from './control/ScreenInput';
import { LcuInput } from './control/LcuInput';
import { HeroArtEditorDialog } from './control/HeroArtEditorDialog';
import { LineupAssignments } from './control/LineupAssignments';
import { Score } from './shared/Score';
import { DraftHistory } from './shared/DraftHistory';
import { DraftLifecycle } from './control/DraftLifecycle';
import { DraftOverlay } from './overlay/DraftOverlay';
const name = (state: MatchState, id: number, lang: Language) => { const h = heroForState(state, id); return h ? (lang === 'zh' ? h.chineseName : h.englishName) : '—'; };
function HeroSlot({ state, id, ban = false, lang }: { state: MatchState; id?: number | null; ban?: boolean; lang: Language }) {
  const t = translator(lang);
  const skipped = ban && id === null;
  return <div className={`hero-slot ${ban ? 'ban' : ''} ${id ? 'filled' : ''} ${skipped ? 'skipped-ban' : ''}`} key={id ?? (skipped ? 'skipped' : 'empty')}>
    {id ? <><img src={heroForState(state,id)?.imageLink} alt={name(state,id, lang)} /><span>{name(state,id, lang)}</span>{ban && <b className="ban-mark">╱</b>}</>
      : <span className={skipped ? 'empty skipped-ban-label' : 'empty'}>{skipped ? t('emptyBan') : t(ban ? 'ban' : 'emptyPick')}</span>}
  </div>;
}
function Board({ state, lang, compact = false }: { state: MatchState; lang: Language; compact?: boolean }) {
  const t = translator(lang);
  const phase = phases(state.draftMode, state.firstPickSide)[state.currentPhase];
  return <section className={`board ${compact ? 'compact-board' : ''}`}><div className="match-strip"><span>{t('gameTitle')}</span><span>{stageName(state.stage, lang)} · {t('gameNumber', { number: currentGame(state) })} · {seriesName(state.seriesFormat, lang)} · {draftRuleName(state, lang)}</span></div>
    <div className="team-grid">{displaySides(state).map(side => <section key={side} className={`team ${side} ${phase?.team === side ? 'active' : ''}`}><header>{state[`${side}Team`].logo && <img className="logo" src={state[`${side}Team`].logo} alt="" />}<h2>{teamName(state, side)}</h2><Score state={state} side={side} /></header><div className="picks">{Array.from({ length: 5 }, (_, i) => <HeroSlot key={i} state={state} id={state[`${side}Picks`][i]} lang={lang} />)}</div><div className="bans"><small>{t('ban')}</small>{Array.from({ length: state.draftMode === 'match' ? 5 : 2 }, (_, i) => <HeroSlot key={i} state={state} id={state[`${side}Bans`][i]} ban lang={lang} />)}</div></section>)}</div>
    <footer className={`phase ${phase?.team || ''}`} key={state.currentPhase}>{phase ? `${phaseName(state, lang)} · ${t('phaseStep', { step: state.currentPhase + 1, total: phases(state.draftMode, state.firstPickSide).length })}` : t('draftComplete')}</footer></section>;
}
function CasterRoster({ state, lang, delaySeconds }: { state: MatchState; lang: Language; delaySeconds: number }) {
  const t = translator(lang);
  return <section className="panel caster-roster">
    <header className="caster-roster-header">
      <div><h2>{t('casterRosterTitle')}</h2><p className="muted">{t('casterRosterHint')}</p></div>
      {delaySeconds > 0 && <span className="caster-delay-badge">{t('delayedFeed', { seconds: delaySeconds })}</span>}
    </header>
    {delaySeconds > 0 && <p className="caster-delay-note">{t('casterDelayWaiting', { seconds: delaySeconds })}</p>}
    <div className="caster-roster-grid">
      {displaySides(state).map(side => {
        const team=state[`${side}Team`];
        return <section key={team.id} className={`caster-roster-team ${side}`}>
          <header>{team.logo && <img src={team.logo} alt="" />}<div><small>{t(side === 'blue' ? 'blueSide' : 'redSide')}</small><strong>{teamName(state, side)}</strong></div></header>
          <div className="caster-player-list">
            {team.players.map((player,index)=><div className="caster-player" key={index}>
              <span className="caster-role">{t(team.playerRoles[index])}</span>
              <b>{player || t('playerNumber',{number:index+1})}</b>
            </div>)}
          </div>
        </section>;
      })}
    </div>
  </section>;
}

function TeamAnalysis({
  state,
  lang,
  side,
}: {
  state: MatchState;
  lang: Language;
  side: Side;
}) {
  const t = translator(lang);
  const picks = state[`${side}Picks`], enemy = state[`${side === 'blue' ? 'red' : 'blue'}Picks`];
  const selected = [...state.bluePicks, ...state.redPicks];
  const groups = [
    { title: t('synergy'), sources: picks, field: 'combo' as const },
    { title: t('ourCounters'), sources: picks, field: 'counter' as const },
    { title: t('counteredBy'), sources: picks, field: 'beCountered' as const },
    { title: t('enemyCounters'), sources: enemy, field: 'beCountered' as const },
  ];
  return <section className={`panel analysis analysis-${side}`} data-side={side}>
    <header className="analysis-team-header">
      {state[`${side}Team`].logo && <img className="analysis-logo" src={state[`${side}Team`].logo} alt="" />}
      <div><span className="analysis-side">{t(side === 'blue' ? 'blueAnalysis' : 'redAnalysis')}</span><h2>{teamName(state, side)}</h2></div>
      <span className="analysis-opponent">{t('opponent', { team: teamName(state, side === 'blue' ? 'red' : 'blue') })}</span>
    </header>
    <small>{t('relationshipHint')}</small><div className="analysis-grid">{groups.map(g => {
      const ids = [...new Set(g.sources.flatMap(id => heroForState(state,id)?.[g.field] || []))].filter(id => heroForState(state,id) && !state.blueBans.includes(id) && !state.redBans.includes(id));
      return <article key={g.title}><h3>{g.title}</h3>{ids.length ? <div className="recommendations">{ids.map(id => <div className="recommendation" key={id}><img src={heroForState(state,id)?.imageLink} alt="" /><div><b>{name(state,id, lang)}{selected.includes(id) ? ' ✓' : ''}</b><small>{g.sources.filter(s => heroForState(state,s)?.[g.field]?.includes(id)).map(s => name(state,s, lang)).join(' · ')}</small></div></div>)}</div> : <p className="muted">{t('noRelationships')}</p>}</article>;
    })}</div></section>;
}
function Analysis({
  state,
  lang,
}: {
  state: MatchState;
  lang: Language;
}) {
  return (
    <section className="dual-analysis">
      {displaySides(state).map(side => <TeamAnalysis key={state[`${side}Team`].id} state={state} lang={lang} side={side} />)}
    </section>
  );
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
  const firstPickLocked = state.currentPhase > 0;
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
          {(['BO1', 'BO3', 'BO5'] as const).map(format => <option key={format} value={format}>{seriesName(format, state.language)}</option>)}
        </select></label>
        <label>{t('currentGame')}<div className="readonly-field">{t('gameNumber', { number: state.gameNumber })} · {t('automatic')}</div></label>
        <label>{t('draftMode')}<select disabled={state.currentPhase > 0} value={form.draftMode} onChange={e => setForm({ ...form, draftMode: e.target.value as MatchSettings['draftMode'] })}>
          <option value="match">{t('matchMode')}</option><option value="normal">{t('normalMode')}</option>
        </select></label>
        <label>{t('draftRules')}<select aria-label={t('draftRules')} disabled={ruleLocked(state)} value={form.draftRuleMode} onChange={e => setForm({ ...form, draftRuleMode: e.target.value as MatchSettings['draftRuleMode'] })}>
          <option value="normal">{t('ruleNormal')}</option><option value="player">{t('rulePlayer')}</option><option value="global">{t('ruleGlobal')}</option>
        </select></label>
        {ruleLocked(state) && <p className="muted">{t('rulesLocked')}</p>}
      </section>
      <section><h3>{t('matchSettings')}</h3>
        <label>{t('firstPickSide')}<select aria-label={t('firstPickSide')} disabled={firstPickLocked} value={form.firstPickSide} onChange={e => setForm({ ...form, firstPickSide: e.target.value as Side })}>
          <option value="blue">{t('blueSide')}</option><option value="red">{t('redSide')}</option>
        </select></label>
        <label>{t('sideSwapMode')}<select aria-label={t('sideSwapMode')} value={form.sideSwapMode} onChange={e => setForm({ ...form, sideSwapMode: e.target.value as MatchSettings['sideSwapMode'] })}>
          <option value="moveTeams">{t('moveTeams')}</option><option value="colorsOnly">{t('colorsOnly')}</option>
        </select></label>
        <label>{t('language')}<select aria-label={t('language')} value={form.language} onChange={e => setForm({ ...form, language: e.target.value as Language })}>
          <option value="zh">{t('chinese')}</option><option value="eng">{t('english')}</option>
        </select><small>{t('languageHint')}</small></label>
        <label>{t('scoreDisplay')}<select value={form.scoreDisplay || 'number'} onChange={e => setForm({ ...form, scoreDisplay: e.target.value as MatchSettings['scoreDisplay'] })}><option value="number">{t('scoreNumber')}</option><option value="boxes">{t('scoreBoxes')}</option></select></label>
        <label>{t('bpInputMode')}<select value={form.bpInputMode === 'lcu' ? 'lcu' : 'manual'} onChange={e => setForm({ ...form, bpInputMode: e.target.value as MatchSettings['bpInputMode'] })}><option value="manual">{t('manualInput')}</option><option value="lcu">{t('lcuInput')}</option></select><small>{t('lcuInputHint')}</small></label>
        <label>{t('overlayLayout')}<select value={form.overlayLayout} onChange={e => setForm({ ...form, overlayLayout: e.target.value as MatchSettings['overlayLayout'] })}>
          <option value="panel">{t('panelLayout')}</option><option value="side">{t('sideLayout')}</option>
        </select></label>
        <label>{t('roleIconStyle')}<select value={form.roleIconStyle} onChange={e => setForm({ ...form, roleIconStyle: e.target.value as MatchSettings['roleIconStyle'] })}>
          <option value="minimal">{t('roleIconMinimal')}</option><option value="ornate">{t('roleIconOrnate')}</option>
        </select></label>
        <label>{t('roleIconBackground')}<select value={form.roleIconBackground} onChange={e => setForm({ ...form, roleIconBackground: e.target.value as MatchSettings['roleIconBackground'] })}>
          <option value="light">{t('roleIconLight')}</option><option value="dark">{t('roleIconDark')}</option>
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
    <TeamLibrary onRosterApply={(side,index,player) => setForm(previous => {const key = side === 'blue' ? 'blueTeam' : 'redTeam';const team=previous[key];return {...previous,[key]:{...team,players:team.players.map((p,i) => i === index ? player.name : p),playerRoles:team.playerRoles.map((r,i) => i === index ? player.role : r),playerPortraits:team.playerPortraits.map((p,i) => i === index ? player.portrait : p)}};})} state={state} form={form} token={token} disabled={disabled || uploads.size > 0} send={send} />
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
            <label>{t('lane')}<select disabled={disabled} value={form[teamKey].playerRoles[index]} onChange={e => updateTeam({ playerRoles: form[teamKey].playerRoles.map((r, i) => i === index ? e.target.value as typeof r : r) })}>
              {(['top', 'jungle', 'mid', 'bot', 'support'] as const).map(role => <option key={role} value={role}>{t(role)}</option>)}
            </select></label>
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
  return fragment || sessionStorage.getItem(`lol-${role}`) || (import.meta.env.DEV ? `local-${role}` : '');
}
export default function BroadcastApp() {
  const role: Role = location.pathname === '/caster' ? 'caster' : location.pathname === '/overlay/draft' ? 'overlay' : 'control';
  const [token, setToken] = useState(() => initialToken(role));
  const [tokenInput, setTokenInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [showHeroArtEditor, setShowHeroArtEditor] = useState(false);
  const [delayInput, setDelayInput] = useState(180);
  const [lastLanguage, setLastLanguage] = useState<Language>(() => sessionStorage.getItem(`lol-language-${role}`) === 'eng' ? 'eng' : 'zh');
  const { snapshot, status, error, pending, send, acknowledged } = useMatch(role, token);
  const connected = status === 'Connected';
  const compatible = !!snapshot?.state && Array.isArray(snapshot.state.draftHistory) && !!snapshot.state.draftRuleMode && !!snapshot.state.firstPickSide && !!snapshot.state.sideSwapMode && !!snapshot.state.displayLeftSide && typeof snapshot.state.showHeroName === 'boolean' && !!snapshot.state.artSourceMode && !!snapshot.state.heroArtOverrides && typeof snapshot.state.flowbornFormsIndependent === 'boolean';
  const disabled = !connected || pending || !compatible;
  const state = snapshot?.state ? normalizeState(snapshot.state) : undefined;
  const lang: Language = token && !['Invalid token', 'Access rejected'].includes(status) ? state?.language ?? lastLanguage : lastLanguage;
  const t = translator(lang);
  useEffect(() => {
    document.documentElement.lang = lang === 'eng' ? 'en' : 'zh-CN';
    document.title = translator(lang)('appName');
    sessionStorage.setItem(`lol-language-${role}`, lang);
    setLastLanguage(lang);
  }, [lang, role]);
  if (role === 'overlay') {
    return <main className="overlay">{state && <DraftOverlay state={state} />}</main>;
  }
  if (!token || status === 'Invalid token' || status === 'Access rejected') {
    return <main className="login panel">
      <p>{t('appName')}</p><h1>{t(role === 'caster' ? 'casterLogin' : 'controlLogin')}</h1>
      <form onSubmit={e => { e.preventDefault(); sessionStorage.setItem(`lol-${role}`, tokenInput); setToken(tokenInput); }}>
        <label>{t('accessToken')}<input type="password" required value={tokenInput} onChange={e => setTokenInput(e.target.value)} /></label>
        <button className="primary">{t('connect')}</button>
      </form><p>{connectionLabel(status, lang)}</p>
    </main>;
  }
  return <main className={`workspace ${role === 'control' ? 'control-workspace' : ''}`}>
    <header className="topbar">
      <div><span className="eyebrow">{t(role === 'caster' ? 'casterEyebrow' : 'controlEyebrow')}</span><h1>{t('brandTitle')} <span>{t('brandSubtitle')}</span></h1></div>
      <div className="toolbar">
        <b className={connected ? 'status live' : 'status'}>{connectionLabel(status, lang)}</b>
        <span>{role === 'caster' ? t('delayedFeed', { seconds: snapshot?.casterDelaySeconds ?? '—' }) : t('controlRealtime')}</span>
        <button onClick={() => { sessionStorage.removeItem(`lol-${role}`); setToken(''); }}>{t('logout')}</button>
      </div>
    </header>
    {!connected && <p className="notice">{t('disconnectedNotice')}</p>}
    {connected && !compatible && <p className="notice">{t('backendUpgrade')}</p>}
    {error && <p role="alert" className="error">{errorMessage(error, lang)}</p>}
    {state ? <>
      {role === 'caster' && <><Board state={state} lang={lang} /><CasterRoster state={state} lang={lang} delaySeconds={snapshot?.casterDelaySeconds ?? 0} /></>}
      {role === 'control' && <>
        <ControlDraftWorkspace monitor={<>
          <Board state={state} lang={lang} compact />
          <section className="operator-bar panel">
            <div className="toolbar">
              <button disabled={disabled || !snapshot?.canUndo} onClick={() => send({ type: 'undo' })}>{t('undo')}</button>
              <button disabled={disabled} onClick={() => confirm(t('confirmResetDraft')) && send({ type: 'reset_draft' })}>{t('resetDraft')}</button>
              <button className="danger" disabled={disabled} onClick={() => confirm(t('confirmResetMatch')) && send({ type: 'reset_match' })}>{t('resetMatch')}</button>
              <button aria-expanded={showSettings} aria-controls="match-settings" onClick={() => setShowSettings(value => !value)}>{t('matchSettings')}</button>
              <button onClick={() => setShowTeamSettings(true)}>{t('teamSettings')}</button>
              <button onClick={() => setShowHeroArtEditor(true)}>{t('heroImageSettings')}</button>
            </div>
            <div className="delay-controls">
              <b>{t('casterDelay', { seconds: snapshot?.casterDelaySeconds ?? '—' })}</b>
              {[-10, -5, -1, 1, 5, 10].map(n => <button key={n}
                aria-label={t(n > 0 ? 'increaseDelay' : 'decreaseDelay', { seconds: Math.abs(n) })}
                disabled={disabled || (snapshot?.casterDelaySeconds || 0) + n < 0 || (snapshot?.casterDelaySeconds || 0) + n > 3600}
                onClick={() => send({ type: 'delay', seconds: (snapshot?.casterDelaySeconds || 0) + n })}>{n > 0 ? '+' : ''}{n} {t('secondsShort')}</button>)}
              <input aria-label={t('delayInput')} type="number" min={0} max={3600} value={delayInput} onChange={e => setDelayInput(Number(e.target.value))} />
              <button disabled={disabled} onClick={() => send({ type: 'delay', seconds: delayInput })}>{t('setDelay')}</button>
            </div>
          </section>

          <DraftLifecycle state={state} send={send} disabled={disabled} />
          {showSettings && <SettingsDialog label={t('matchSettings')} closeLabel={t('hideSettings')} onClose={() => setShowSettings(false)}><MatchSettingsPanel key={JSON.stringify([state.seriesFormat, state.stage, state.draftMode, state.draftRuleMode, state.firstPickSide, state.sideSwapMode, state.language, state.overlayLayout, state.scoreDisplay, state.bpInputMode, state.roleIconStyle, state.roleIconBackground, state.showHeroName, state.artSourceMode])} state={state} send={send} disabled={disabled} /></SettingsDialog>}
          {state.bpInputMode === 'lcu' && <LcuInput state={state} token={token} />}
          {state.bpInputMode === 'screen' && <ScreenInput state={state} revision={snapshot!.revision} token={token} disabled={disabled} send={send} />}
          <LineupAssignments state={state} revision={snapshot!.revision} token={token} disabled={disabled} send={send} />
        </>}>
          <ControlHeroPicker state={state} disabled={disabled} active={!showSettings && !showTeamSettings && !showHeroArtEditor} send={send} acknowledged={acknowledged} />
        </ControlDraftWorkspace>
        {showTeamSettings && <TeamSettingsDialog label={t('teamSettings')} closeLabel={t('closeTeamSettings')} onClose={() => setShowTeamSettings(false)}>
          <TeamSettingsPanel key={JSON.stringify([state.blueTeam, state.redTeam])} state={state} send={send} disabled={disabled} token={token} />
        </TeamSettingsDialog>}
        {showHeroArtEditor && <HeroArtEditorDialog state={state} send={send} disabled={disabled} onClose={() => setShowHeroArtEditor(false)} />}
      </>}
      <DraftHistory state={state} />
      <Analysis state={state} lang={lang} />
    </> : <section className="panel"><h2>{t('connectingServer')}</h2></section>}
    <footer className="page-footer">{t('communitySystem')} · {t(role === 'caster' ? 'readOnlyFooter' : 'serverFooter')} · {t('rosterUpdated', { date: '2026-09-16' })}</footer>
  </main>;
}

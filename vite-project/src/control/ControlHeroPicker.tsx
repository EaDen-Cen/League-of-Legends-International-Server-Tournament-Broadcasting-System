import { useEffect, useState } from 'react';
import { heroesForState } from '../shared/heroData';
import { draftHeroUsed, draftRestriction } from '../shared/draftRules';
import { draftPhases } from '../shared/gameRules';
import { lanes, laneName, phaseName } from '../shared/display';
import { translator } from '../shared/i18n';
import { portraitAssetURL } from '../shared/config';
import type { Action, MatchState } from '../shared/types';
import { sortHeroes } from './heroSort';
import { heroMatchesSearch } from './heroSearch';

export function ControlHeroPicker({ state, disabled, send, acknowledged, readOnlyReason = '', captain = false }: {
  state: MatchState; disabled: boolean; active?: boolean; send: (action: Action) => void;
  acknowledged?: { id: string; action: Action }; readOnlyReason?: string; captain?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<number[]>([]);
  const zh = state.language === 'zh', t = translator(state.language);
  const phases = draftPhases(state), phase = phases[state.currentPhase];
  const heroes = heroesForState(state);
  useEffect(() => { setSelected([]); }, [state.gameId, state.currentPhase, disabled]);
  useEffect(() => { if (acknowledged?.action.type === 'draft_group') setSelected([]); }, [acknowledged]);
  const reason = (id: number) => {
    if (!phase || state.draftComplete) return zh ? 'BP 已完成' : 'Draft complete';
    if (state.currentGameRules?.heroPool && !state.currentGameRules.heroPool.includes(id)) return zh ? '不在本局英雄池' : 'Outside game pool';
    if (state.blueBans.includes(id) || state.redBans.includes(id)) return zh ? '已禁用' : 'Banned';
    if ((phase.action === 'ban' || !state.currentGameRules?.allowDuplicates) && draftHeroUsed(state, id)) return zh ? '已禁用或已选择' : 'Already banned or picked';
    const restriction = draftRestriction(state, phase.team, phase.action, id);
    return restriction ? t(restriction) : '';
  };
  const visible = sortHeroes(heroes.filter(h => (filter === 'all' || h.occupation === filter || h.altOccupation === filter)
    && heroMatchesSearch(h, search, state.language)), zh ? 'name-zh' : 'name-en', id => !!reason(id));
  const locked = disabled || state.bpPaused || !phase || !!state.committedGameId || !!readOnlyReason;
  const toggle = (id: number) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id)
    : previous.length < (phase?.count ?? 1) ? [...previous, id] : (phase?.count ?? 1) === 1 ? [id] : previous);
  return <section className="panel control-hero-picker">
    <div className={`picker-heading side-${phase?.team || 'none'}`}>
      <div className="current-phase"><span className="section-kicker">CHAMPION SELECT</span><h2>{phaseName(state)}</h2>
        <p role="status" className="draft-access-status">{readOnlyReason || (state.bpPaused ? (zh ? 'BP 已暂停，等待导播恢复' : 'Paused by director')
          : phase ? `${zh ? '本步需确认' : 'Confirm'} ${phase.count} ${zh ? '个英雄' : 'champion(s)'} · ${state.currentPhase + 1}/${phases.length}` : (zh ? 'BP 完成' : 'Draft complete'))}</p></div>
      <input aria-label={t('searchHeroes')} placeholder={t('searchHeroes')} value={search} onChange={event => setSearch(event.target.value)} />
      <div className="filters">{lanes.map(lane => <button key={lane} className={filter === lane ? 'selected' : ''} onClick={() => setFilter(lane)}>{laneName(lane, state.language)}</button>)}</div>
      <div className="draft-confirmation" aria-live="polite">
        <span className="draft-preview-label">{zh ? '本机预选（对手与 OBS 不可见）' : 'Local preview (private)'}</span>
        <div className="draft-preview-champions">{selected.length ? selected.map(id => {
          const hero = heroes.find(item => item.id === id);
          return <span className="preview-champion" key={id}><img src={portraitAssetURL(hero?.imageLink ?? '')} alt="" />{zh ? hero?.chineseName : hero?.englishName}</span>;
        }) : <span className="preview-empty">{zh ? '选择英雄后，在此确认' : 'Choose champions, then confirm here'}</span>}</div>
        <div className="draft-confirmation-actions">
          <button className="primary" disabled={locked || selected.length !== phase?.count} onClick={() => phase && send({ type: 'draft_group', team: phase.team, action: phase.action, heroIds: selected })}>
            {disabled ? (zh ? '等待连接或服务器确认' : 'Waiting for connection / confirmation') : phase?.action === 'ban' ? (zh ? '确认禁用' : 'Confirm Ban') : (zh ? '确认选择' : 'Confirm Pick')}
          </button>
          {!captain && phase?.action === 'ban' && <button disabled={locked} onClick={() => send({ type: 'skip_ban', team: phase.team })}>{zh ? '明确跳过本步 Ban' : 'Skip Ban step'}</button>}
        </div>
        {acknowledged?.action.type === 'draft_group' && <small>{zh ? '服务器已确认上一手' : 'Previous selection confirmed by server'}</small>}
      </div>
    </div>
    <div className="hero-grid-scroll"><div className="hero-grid">{visible.map(hero => {
      const unavailable = reason(hero.id), label = zh ? hero.chineseName : hero.englishName;
      return <button key={hero.id} aria-label={label} aria-pressed={selected.includes(hero.id)} title={unavailable || label}
        className={selected.includes(hero.id) ? 'selected enter-target' : ''} disabled={locked || !!unavailable} onClick={() => toggle(hero.id)}>
        <img src={portraitAssetURL(hero.imageLink)} alt="" /><span>{label}</span>{unavailable && <small className="eligibility-reason">{unavailable}</small>}
      </button>;
    })}</div>{!visible.length && <p>{t('noMatchingHeroes')}</p>}</div>
  </section>;
}

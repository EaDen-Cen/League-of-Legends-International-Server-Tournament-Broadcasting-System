import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import heroes from '../components/HeroList';
import { heroesForState } from '../shared/heroData';
import { defaultHeroArtCrop, heroArtCrop } from '../data/heroArtFocus';
import { translator } from '../shared/i18n';
import { heroMatchesSearch } from './heroSearch';
import type { Action, HeroArtCrop, HeroArtLayout, HeroArtOverride, HeroDataOverride, MatchState } from '../shared/types';

const targetAspect: Record<HeroArtLayout, number> = {
  // Matches the actual 1920x1080 broadcast card viewports.
  panel: 0.65,
  side: 1.90,
};

interface SourceSize { width: number; height: number }

function sourceFrame(crop: HeroArtCrop, layout: HeroArtLayout, source: SourceSize) {
  const { width, height } = source;
  const viewportAspect = targetAspect[layout];
  const sourceAspect = width / height;
  const px = crop.x / 100;
  const py = crop.y / 100;

  let visibleWidth = width;
  let visibleHeight = height;
  let baseLeft = 0;
  let baseTop = 0;

  // This is the exact source rectangle produced by object-fit: cover before
  // the additional director zoom is applied.
  if (sourceAspect > viewportAspect) {
    visibleWidth = height * viewportAspect;
    baseLeft = (width - visibleWidth) * px;
  } else {
    visibleHeight = width / viewportAspect;
    baseTop = (height - visibleHeight) * py;
  }

  const focalX = width * px;
  const focalY = height * py;
  const scale = Math.max(1, crop.scale);
  const left = focalX + (baseLeft - focalX) / scale;
  const top = focalY + (baseTop - focalY) / scale;

  return {
    left,
    top,
    width: visibleWidth / scale,
    height: visibleHeight / scale,
  };
}

function frameStyle(crop: HeroArtCrop, layout: HeroArtLayout, source: SourceSize): CSSProperties {
  const frame = sourceFrame(crop, layout, source);
  return {
    left: `${frame.left / source.width * 100}%`,
    top: `${frame.top / source.height * 100}%`,
    width: `${frame.width / source.width * 100}%`,
    height: `${frame.height / source.height * 100}%`,
  };
}

function CropPreview({
  src,
  crop,
  layout,
  legacy,
  alt,
}: {
  src: string;
  crop: HeroArtCrop;
  layout: HeroArtLayout;
  legacy: boolean;
  alt: string;
}) {
  const [size, setSize] = useState<SourceSize>({ width: 16, height: 9 });
  const frame = sourceFrame(crop, layout, size);

  // Important: preview the source rectangle directly from the ORIGINAL image.
  // Do not object-fit:cover first and then transform that already-cropped result.
  const originalCropStyle: CSSProperties = legacy ? {} : {
    position: 'absolute',
    left: `${-frame.left / frame.width * 100}%`,
    top: `${-frame.top / frame.height * 100}%`,
    width: `${size.width / frame.width * 100}%`,
    height: `${size.height / frame.height * 100}%`,
    maxWidth: 'none',
  };

  return <div className={`art-editor-preview art-editor-preview-${layout}`}>
    <img
      src={src}
      alt={alt}
      className={legacy ? 'legacy-preview-image' : 'source-crop-preview-image'}
      style={originalCropStyle}
      onLoad={event => setSize({
        width: event.currentTarget.naturalWidth || 16,
        height: event.currentTarget.naturalHeight || 9,
      })}
    />
  </div>;
}

function CropControls({
  label,
  crop,
  onChange,
}: {
  label: string;
  crop: HeroArtCrop;
  onChange: (crop: HeroArtCrop) => void;
}) {
  const set = (field: keyof HeroArtCrop, value: number) => onChange({ ...crop, [field]: value });
  return <fieldset className="art-editor-crop-controls">
    <legend>{label}</legend>
    <label>X · {Math.round(crop.x)}%
      <input type="range" min={0} max={100} step={1} value={crop.x} onChange={e => set('x', Number(e.target.value))} />
    </label>
    <label>Y · {Math.round(crop.y)}%
      <input type="range" min={0} max={100} step={1} value={crop.y} onChange={e => set('y', Number(e.target.value))} />
    </label>
    <label>Scale · {crop.scale.toFixed(2)}×
      <input type="range" min={1} max={3} step={0.01} value={crop.scale} onChange={e => set('scale', Number(e.target.value))} />
    </label>
  </fieldset>;
}

export function HeroArtEditorDialog({
  state,
  disabled,
  send,
  onClose,
}: {
  state: MatchState;
  disabled: boolean;
  send: (action: Action) => void;
  onClose: () => void;
}) {
  const t = translator(state.language);
  const dialog = useRef<HTMLDialogElement>(null);
  const currentPicks = [...state.bluePicks, ...state.redPicks];
  const effectiveHeroes = useMemo(() => heroesForState(state), [state.heroDataOverrides]);
  const initialId = currentPicks[0] ?? heroes[0]?.id ?? 1;
  const [heroId, setHeroId] = useState(initialId);
  const [heroQuery, setHeroQuery] = useState('');

  const makeDraft = (id: number): HeroArtOverride => {
    const runtime = state.heroArtOverrides?.[String(id)];
    return {
      useLegacyImage: runtime?.useLegacyImage ?? false,
      panel: { ...heroArtCrop(id, 'panel', runtime) },
      side: { ...heroArtCrop(id, 'side', runtime) },
    };
  };

  const [draft, setDraft] = useState<HeroArtOverride>(() => makeDraft(initialId));
  const makeDataDraft = (id: number): HeroDataOverride => {
    const base = heroes.find(item => item.id === id);
    const runtime = state.heroDataOverrides?.[String(id)];
    return {
      englishName: runtime?.englishName ?? base?.englishName ?? '',
      chineseName: runtime?.chineseName ?? base?.chineseName ?? '',
      occupation: runtime?.occupation ?? base?.occupation ?? '',
      altOccupation: runtime?.altOccupation ?? base?.altOccupation ?? '',
      aliases: runtime?.aliases ?? base?.aliases ?? [],
      imageLink: runtime?.imageLink ?? base?.imageLink ?? '',
      artLink: runtime?.artLink ?? base?.artLink ?? '',
    };
  };
  const [dataDraft, setDataDraft] = useState<HeroDataOverride>(() => makeDataDraft(initialId));
  const selectHero = (nextId: number) => {
    setHeroId(nextId);
    setDraft(makeDraft(nextId));
    setDataDraft(makeDataDraft(nextId));
  };
  const [sourceSize, setSourceSize] = useState<SourceSize>({ width: 16, height: 9 });
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);

  const hero = useMemo(() => effectiveHeroes.find(item => item.id === heroId) ?? effectiveHeroes[0], [effectiveHeroes, heroId]);
  const filteredHeroes = useMemo(
    () => effectiveHeroes.filter(item => heroMatchesSearch(item, heroQuery, state.language)).slice(0, 48),
    [effectiveHeroes, heroQuery, state.language],
  );
  const baseHero = heroes.find(item => item.id === heroId);
  const hasDataOverride = Boolean(state.heroDataOverrides?.[String(heroId)]);
  const hasArtOverride = Boolean(state.heroArtOverrides?.[String(heroId)]);
  if (!hero) return null;

  const panel = draft.panel ?? defaultHeroArtCrop('panel');
  const side = draft.side ?? defaultHeroArtCrop('side');
  const draftPortrait = dataDraft.imageLink?.trim() || hero.imageLink;
  const draftArt = dataDraft.artLink?.trim() || hero.artLink;
  const forcedLegacy = state.artSourceMode === 'legacy' || draft.useLegacyImage === true || !draftArt;
  const source = forcedLegacy ? draftPortrait : draftArt!;
  const fullSource = draftArt || draftPortrait;
  const heroName = state.language === 'zh' ? hero.chineseName : hero.englishName;

  const resetLayout = (layout: HeroArtLayout) => {
    setDraft(previous => ({ ...previous, [layout]: { ...heroArtCrop(hero.id, layout) } }));
  };

  return createPortal(
    <dialog
      ref={dialog}
      className="hero-art-editor-dialog"
      aria-label={t('heroImageSettings')}
      onCancel={event => { event.preventDefault(); onClose(); }}
    >
      <header className="hero-art-editor-header">
        <div><strong>{t('heroImageSettings')}</strong><small>{heroName}</small></div>
        <button type="button" onClick={onClose}>{t('closeHeroImageSettings')}</button>
      </header>

      <div className="hero-art-editor-body">
        <aside className="hero-art-editor-controls">
          <section className="champion-studio-selector">
            <label className="champion-studio-search">{t('championSearch')}
              <input
                value={heroQuery}
                placeholder={t('championSearchHint')}
                onChange={event => setHeroQuery(event.target.value)}
              />
            </label>
            <div className="champion-studio-grid" role="list" aria-label={t('championSearchResults')}>
              {filteredHeroes.map(item => {
                const selected = item.id === hero.id;
                const name = state.language === 'zh' ? item.chineseName : item.englishName;
                return <button
                  type="button"
                  role="listitem"
                  key={item.id}
                  className={selected ? 'selected' : ''}
                  onClick={() => selectHero(item.id)}
                  title={item.englishName}
                >
                  <img src={item.imageLink} alt="" />
                  <span>{name}</span>
                  <small>{item.occupation}</small>
                </button>;
              })}
            </div>
            <small className="champion-studio-result-count">{t('championResultCount', { shown: filteredHeroes.length, total: effectiveHeroes.length })}</small>
          </section>

          <label>{t('chooseHeroToEdit')}
            <select value={hero.id} onChange={event => selectHero(Number(event.target.value))}>
              {effectiveHeroes.map(item => <option key={item.id} value={item.id}>{state.language === 'zh' ? item.chineseName : item.englishName} · {item.englishName}</option>)}
            </select>
          </label>

          <fieldset className="hero-data-editor">
            <legend>{t('heroDataSettings')}</legend>
            <label>{t('heroChineseName')}<input maxLength={60} value={dataDraft.chineseName ?? ''} onChange={event => setDataDraft(previous => ({ ...previous, chineseName: event.target.value }))} /></label>
            <label>{t('heroEnglishName')}<input maxLength={60} value={dataDraft.englishName ?? ''} onChange={event => setDataDraft(previous => ({ ...previous, englishName: event.target.value }))} /></label>
            <label>{t('heroPrimaryLane')}<select value={dataDraft.occupation ?? ''} onChange={event => setDataDraft(previous => ({ ...previous, occupation: event.target.value }))}>{['Top Lane','Jungle','Mid Lane','Bot Lane','Support'].map(lane => <option key={lane} value={lane}>{lane}</option>)}</select></label>
            <label>{t('heroSecondaryLane')}<select value={dataDraft.altOccupation ?? ''} onChange={event => setDataDraft(previous => ({ ...previous, altOccupation: event.target.value }))}><option value="">{t('noSecondaryLane')}</option>{['Top Lane','Jungle','Mid Lane','Bot Lane','Support'].map(lane => <option key={lane} value={lane}>{lane}</option>)}</select></label>
            <label>{t('championPortraitUrl')}<input maxLength={1000} value={dataDraft.imageLink ?? ''} onChange={event => setDataDraft(previous => ({ ...previous, imageLink: event.target.value }))} /><small>{t('championPortraitUrlHint')}</small></label>
            <label>{t('championSplashUrl')}<input maxLength={1000} value={dataDraft.artLink ?? ''} onChange={event => setDataDraft(previous => ({ ...previous, artLink: event.target.value }))} /><small>{t('championSplashUrlHint')}</small></label>
            <label>{t('heroAliases')}<input maxLength={500} value={(dataDraft.aliases ?? []).join(', ')} onChange={event => setDataDraft(previous => ({ ...previous, aliases: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} /><small>{t('heroAliasesHint')}</small></label>
            <div className="art-editor-actions">
              <button type="button" className="primary" disabled={disabled} onClick={() => send({ type: 'hero_data_override', heroId: hero.id, override: dataDraft })}>{t('saveHeroData')}</button>
              <button type="button" disabled={disabled} onClick={() => { send({ type: 'reset_hero_data_override', heroId: hero.id }); const base = heroes.find(item => item.id === hero.id); if (base) setDataDraft({ englishName: base.englishName, chineseName: base.chineseName, occupation: base.occupation, altOccupation: base.altOccupation ?? '', aliases: base.aliases ?? [], imageLink: base.imageLink, artLink: base.artLink ?? '' }); }}>{t('resetHeroData')}</button>
            </div>
          </fieldset>

          <label className="art-editor-checkbox">
            <input
              type="checkbox"
              checked={draft.useLegacyImage === true}
              disabled={!draftArt}
              onChange={event => setDraft(previous => ({ ...previous, useLegacyImage: event.target.checked }))}
            />
            {t('useLegacyForHero')}
          </label>
          {!hero.artLink && <p className="notice">{t('fullArtUnavailable')}</p>}

          <CropControls label={t('cropPanel')} crop={panel} onChange={crop => setDraft(previous => ({ ...previous, panel: crop }))} />
          <button type="button" onClick={() => resetLayout('panel')}>{t('resetCrop')} · {t('panelLayout')}</button>

          <CropControls label={t('cropSide')} crop={side} onChange={crop => setDraft(previous => ({ ...previous, side: crop }))} />
          <button type="button" onClick={() => resetLayout('side')}>{t('resetCrop')} · {t('sideLayout')}</button>

          <div className="art-editor-actions">
            <button
              type="button"
              className="primary"
              disabled={disabled}
              onClick={() => send({ type: 'hero_art_override', heroId: hero.id, override: draft })}
            >{t('saveHeroArt')}</button>
            <button
              type="button"
              className="danger"
              disabled={disabled}
              onClick={() => {
                send({ type: 'reset_hero_art_override', heroId: hero.id });
                setDraft({
                  useLegacyImage: false,
                  panel: { ...heroArtCrop(hero.id, 'panel') },
                  side: { ...heroArtCrop(hero.id, 'side') },
                });
              }}
            >{t('resetHeroArt')}</button>
          </div>
        </aside>

        <section className="hero-art-editor-stage">
          <div className="champion-studio-summary">
            <div>
              <span className="eyebrow">{t('championProfile')}</span>
              <h2>{heroName}</h2>
              <p>{hero.englishName} · Riot ID {hero.id} · {hero.occupation}{hero.altOccupation ? ` / ${hero.altOccupation}` : ''}</p>
            </div>
            <div className="champion-studio-badges">
              <span className={hasDataOverride ? 'active' : ''}>{hasDataOverride ? t('dataOverrideActive') : t('baseChampionData')}</span>
              <span className={hasArtOverride ? 'active' : ''}>{hasArtOverride ? t('artOverrideActive') : t('baseChampionArt')}</span>
              {baseHero && <span>{t('sourceDataDragon')}</span>}
            </div>
          </div>
          <div>
            <h3>{t('artReference')}</h3>
            <p className="muted">{t('artReferenceHint')}</p>
          </div>
          <div
            className="art-editor-reference"
            style={{ aspectRatio: `${sourceSize.width} / ${sourceSize.height}` }}
          >
            <img
              src={fullSource}
              alt={heroName}
              onLoad={event => setSourceSize({
                width: event.currentTarget.naturalWidth || 16,
                height: event.currentTarget.naturalHeight || 9,
              })}
            />
            <div className="art-reference-frame panel-frame" style={frameStyle(panel, 'panel', sourceSize)}><span>{t('panelLayout')}</span></div>
            <div className="art-reference-frame side-frame" style={frameStyle(side, 'side', sourceSize)}><span>{t('sideLayout')}</span></div>
          </div>

          <h3>{t('livePreview')}</h3>
          <div className="art-editor-previews">
            <div><span>{t('panelLayout')}</span><CropPreview src={source} crop={panel} layout="panel" legacy={forcedLegacy} alt={heroName} /></div>
            <div><span>{t('sideLayout')}</span><CropPreview src={source} crop={side} layout="side" legacy={forcedLegacy} alt={heroName} /></div>
          </div>
        </section>
      </div>
    </dialog>,
    document.body,
  );
}

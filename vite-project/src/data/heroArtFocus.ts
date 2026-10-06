import type { HeroArtCrop, HeroArtLayout, HeroArtOverride } from '../shared/types.js';

const defaults: Record<HeroArtLayout, HeroArtCrop> = {
  panel: { x: 50, y: 31, scale: 1.12 },
  side: { x: 50, y: 29, scale: 1.22 },
};

const overrides: Record<number, Partial<Record<HeroArtLayout, HeroArtCrop>>> = {};

function normalizeCrop(crop: HeroArtCrop): HeroArtCrop {
  return {
    x: Math.min(100, Math.max(0, crop.x)),
    y: Math.min(100, Math.max(0, crop.y)),
    // A value below 1 scales an already-cover-cropped image down and exposes
    // empty space. The editor/overlay crop model is defined on the original
    // source image, so 1 is the true "widest possible crop" baseline.
    scale: Math.min(3, Math.max(1, crop.scale)),
  };
}

export function heroArtCrop(heroId: number, layout: HeroArtLayout, runtime?: HeroArtOverride): HeroArtCrop {
  return normalizeCrop(runtime?.[layout] || overrides[heroId]?.[layout] || defaults[layout]);
}

export function defaultHeroArtCrop(layout: HeroArtLayout): HeroArtCrop {
  return normalizeCrop(defaults[layout]);
}

export default overrides;

import type { Hero } from '../data/heroTypes.js';

export type HeroSortMode = 'name-zh' | 'name-en' | 'release' | 'pick-rate' | 'lane';

export const heroSortModes: HeroSortMode[] = ['name-zh', 'name-en', 'release', 'pick-rate', 'lane'];

const zhCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const enCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const laneOrder: Record<string, number> = {
  'Top Lane': 0,
  'Mid Lane': 2,
  'Bot Lane': 3,
  Jungle: 1,
  Support: 4,
};

function releaseTime(hero: Hero) {
  if (!hero.releaseDate) return undefined;
  const value = Date.parse(hero.releaseDate);
  return Number.isFinite(value) ? value : undefined;
}

function fallbackName(a: Hero, b: Hero) {
  return zhCollator.compare(a.chineseName, b.chineseName)
    || enCollator.compare(a.englishName, b.englishName)
    || a.id - b.id;
}

export function compareHeroes(a: Hero, b: Hero, mode: HeroSortMode) {
  switch (mode) {
  case 'name-zh':
    return zhCollator.compare(a.chineseName, b.chineseName) || enCollator.compare(a.englishName, b.englishName);
  case 'name-en':
    return enCollator.compare(a.englishName, b.englishName) || zhCollator.compare(a.chineseName, b.chineseName);
  case 'release': {
    const av = releaseTime(a);
    const bv = releaseTime(b);
    if (av === undefined && bv !== undefined) return 1;
    if (av !== undefined && bv === undefined) return -1;
    if (av !== undefined && bv !== undefined && av !== bv) return bv - av; // newest first
    return fallbackName(a, b);
  }
  case 'pick-rate': {
    const av = a.officialPickRate;
    const bv = b.officialPickRate;
    if (av === undefined && bv !== undefined) return 1;
    if (av !== undefined && bv === undefined) return -1;
    if (av !== undefined && bv !== undefined && av !== bv) return bv - av; // highest first
    return fallbackName(a, b);
  }
  case 'lane': {
    const av = laneOrder[a.occupation] ?? 999;
    const bv = laneOrder[b.occupation] ?? 999;
    if (av !== bv) return av - bv;
    return fallbackName(a, b);
  }
  }
}

export function sortHeroes(
  source: Hero[],
  mode: HeroSortMode,
  isUnavailable: (id: number) => boolean,
) {
  return [...source].sort((a, b) => {
    const au = isUnavailable(a.id);
    const bu = isUnavailable(b.id);
    if (au !== bu) return au ? 1 : -1;
    return compareHeroes(a, b, mode);
  });
}

export function heroSortCoverage(source: Hero[], mode: HeroSortMode) {
  if (mode === 'release') return source.filter(hero => Boolean(hero.releaseDate)).length;
  if (mode === 'pick-rate') return source.filter(hero => hero.officialPickRate !== undefined).length;
  return source.length;
}

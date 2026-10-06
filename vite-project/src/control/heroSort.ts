import type { Hero } from '../data/heroTypes.js';

export type HeroSortMode = 'name-zh' | 'name-en' | 'lane';

export const heroSortModes: HeroSortMode[] = ['lane', 'name-zh', 'name-en'];

const zhCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const enCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const laneOrder: Record<string, number> = {
  'Top Lane': 0,
  Jungle: 1,
  'Mid Lane': 2,
  'Bot Lane': 3,
  Support: 4,
};

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

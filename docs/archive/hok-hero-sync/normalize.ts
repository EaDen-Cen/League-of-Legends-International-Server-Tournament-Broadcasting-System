import { LANES, type Lane } from './types.js';

const punctuation = /[\s.'’`´_\-&/\\()[\]{}:;,]+/g;

export function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(punctuation, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalizeLane(value: string): Lane | undefined {
  const compact = value.toLowerCase().replace(/[^a-z]/g, '');
  return LANES.find(lane => lane.toLowerCase().replace(/[^a-z]/g, '') === compact);
}

export function namesForHero(hero: { englishName: string; aliases?: string[] }) {
  return [hero.englishName, ...(hero.aliases || [])]
    .map(normalizeName)
    .filter(Boolean);
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

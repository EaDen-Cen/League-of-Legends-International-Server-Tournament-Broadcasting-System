import type { Hero } from '../../src/data/heroTypes.js';
import { normalizeName } from './normalize.js';

export const PLACEHOLDER_CHINESE_NAMES = new Set(['', 'coming soon', 'tbd', 'unknown']);

export function preferredChineseHeroName(englishName: string, officialChineseName?: string) {
  const normalizedEnglish = normalizeName(englishName);
  const flowbornNames: Record<string, string> = {
    flowbornassassin: '元流之子（刺客）',
    flowbornroamer: '元流之子（辅助）',
    flowbornsupport: '元流之子（辅助）',
    flowborntank: '元流之子（坦克）',
    flowbornmarksman: '元流之子（射手）',
    flowbornmage: '元流之子（法师）',
  };
  const mapped = flowbornNames[normalizedEnglish];
  const official = officialChineseName?.trim();
  const normalizedOfficial = (official || '').toLowerCase();

  if (mapped && (!official || PLACEHOLDER_CHINESE_NAMES.has(normalizedOfficial) || official === '元流之子')) {
    return mapped;
  }
  if (!official || PLACEHOLDER_CHINESE_NAMES.has(normalizedOfficial)) return undefined;
  return official;
}

export function needsChineseNameBackfill(hero: Hero) {
  const current = hero.chineseName.trim();
  if (PLACEHOLDER_CHINESE_NAMES.has(current.toLowerCase())) return true;
  if (normalizeName(hero.englishName).startsWith('flowborn') && current === '元流之子') return true;
  return false;
}

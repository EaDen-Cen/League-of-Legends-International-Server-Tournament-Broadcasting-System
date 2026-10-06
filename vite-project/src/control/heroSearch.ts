import { pinyin } from 'pinyin-pro';
import type { Hero } from '../data/heroTypes.js';
import type { Language } from '../shared/types.js';

// Cache by display text so director name/alias edits remain searchable.
const initialsCache = new Map<string, string>();
function initials(value: string) {
  let result = initialsCache.get(value);
  if (result === undefined) {
    result = pinyin(value, { toneType: 'none', type: 'array' }).map(part => part[0] || '').join('').toLowerCase();
    initialsCache.set(value, result);
  }
  return result;
}

export function normalizeHeroSearch(value:string) {
  return value.trim().toLowerCase().replace(/[\s·._'’"“”()（）\-—&/]+/g,'');
}

function consonantSignature(value:string) {
  return normalizeHeroSearch(value).replace(/[aeiou]/g,'');
}

export function heroMatchesSearch(hero:Hero, query:string, language:Language) {
  const normalized=normalizeHeroSearch(query);
  if(!normalized) return true;

  const names=[hero.englishName,hero.chineseName,...(hero.aliases||[])];
  if(names.some(name=>normalizeHeroSearch(name).includes(normalized))) return true;

  if(language==='zh' && /^[a-z]+$/.test(normalized)) {
    if(names.some(name => /[\u3400-\u9fff]/.test(name) && initials(name).includes(normalized))) return true;

    // Useful for transliterated one-word global names such as Malphite -> mlpht.
    if(consonantSignature(hero.englishName).includes(normalized)) return true;
  }
  return false;
}

export function enterTarget<T extends {id:number}>(eligible:T[], query:string) {
  return normalizeHeroSearch(query) ? eligible[0] : undefined;
}

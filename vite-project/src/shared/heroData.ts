import heroes from '../components/HeroList';
import type { Hero } from '../data/heroTypes';
import type { MatchState } from './types';

export function heroForState(state: Pick<MatchState, 'heroDataOverrides'>, id: number | null | undefined): Hero | undefined {
  const base = heroes.find(hero => hero.id === id);
  if (!base) return undefined;
  const override = state.heroDataOverrides?.[String(id)];
  if (!override) return base;
  return {
    ...base,
    ...override,
    aliases: override.aliases ?? base.aliases,
  };
}

export function heroesForState(state: Pick<MatchState, 'heroDataOverrides'>): Hero[] {
  return heroes.map(hero => heroForState(state, hero.id) ?? hero);
}

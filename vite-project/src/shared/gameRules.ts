import type { GameRules, MatchState, SeriesRules } from './types.js';

export function legacyGameRules(state: MatchState): GameRules {
  return { draftMode: state.draftMode, draftRuleMode: state.draftRuleMode,
    firstPickSide: state.firstPickSide, sideSwapMode: state.sideSwapMode,
    enforcePreviousHistory: true, contributeToFutureHistory: true };
}
export function gameRulesFor(state: MatchState, game: number): GameRules {
  return state.seriesRules
    ? { ...state.seriesRules.defaultGameRules, ...state.seriesRules.games[String(game)] }
    : legacyGameRules(state);
}
export function gameRulesLocked(state: MatchState, game: number) {
  const current = state.draftGameNumber ?? state.gameNumber;
  return game < current || state.draftHistory.some(record => record.gameNumber === game)
    || (game === current && (state.currentPhase > 0 || !!state.committedGameId));
}
const fields = ['draftMode', 'draftRuleMode', 'firstPickSide', 'sideSwapMode',
  'enforcePreviousHistory', 'contributeToFutureHistory'] as const;
export function sameGameRules(a: GameRules, b: GameRules) {
  return fields.every(key => a[key] === b[key]);
}
export function validateGameRules(input: unknown): asserts input is GameRules {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid game rules');
  const rules = input as GameRules;
  if (Object.keys(rules).some(key => !(fields as readonly string[]).includes(key))
    || !['match', 'normal'].includes(rules.draftMode)
    || !['normal', 'player', 'global'].includes(rules.draftRuleMode)
    || !['blue', 'red'].includes(rules.firstPickSide)
    || !['moveTeams', 'colorsOnly'].includes(rules.sideSwapMode)
    || typeof rules.enforcePreviousHistory !== 'boolean'
    || typeof rules.contributeToFutureHistory !== 'boolean') throw Error('Invalid game rules');
}
export function validateSeriesRules(input: unknown, maximum: number): asserts input is SeriesRules {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid series rules');
  const plan = input as SeriesRules;
  validateGameRules(plan.defaultGameRules);
  if (Object.keys(plan).some(key => !['defaultGameRules', 'games'].includes(key))
    || !plan.games || typeof plan.games !== 'object' || Array.isArray(plan.games)) throw Error('Invalid series rules');
  for (const [key, override] of Object.entries(plan.games)) {
    if (!/^[1-7]$/.test(key) || Number(key) > maximum || !override
      || typeof override !== 'object' || Array.isArray(override)) throw Error('Invalid game override');
    validateGameRules({ ...plan.defaultGameRules, ...override });
  }
}
export function applyGameRules(state: MatchState) {
  const rules = gameRulesFor(state, state.draftGameNumber ?? state.gameNumber);
  validateGameRules(rules);
  state.currentGameRules = structuredClone(rules);
  state.draftMode = rules.draftMode;
  state.draftRuleMode = rules.draftRuleMode;
  state.firstPickSide = rules.firstPickSide;
  state.sideSwapMode = rules.sideSwapMode;
}
export function eligibleHistory(state: MatchState) {
  if (state.currentGameRules?.enforcePreviousHistory === false) return [];
  return state.draftHistory.filter(record => record.rules?.contributeToFutureHistory !== false);
}

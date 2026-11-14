import { phases, type DraftPhase, type GameRules, type MatchState, type SeriesRules } from './types.js';
import heroes from '../components/HeroList.js';

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
  'enforcePreviousHistory', 'contributeToFutureHistory', 'stages', 'heroPool', 'allowDuplicates'] as const;
export function sameGameRules(a: GameRules, b: GameRules) {
  return fields.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}
export function draftPhases(state: MatchState): DraftPhase[] {
  const rules = state.currentGameRules ?? gameRulesFor(state, state.draftGameNumber ?? state.gameNumber);
  const stages = rules.stages ?? phases(rules.draftMode, rules.firstPickSide).map(stage => ({ ...stage, count: 1 as const }));
  return stages.map((stage, index) => ({ ...stage, stepId: `step-${index}`,
    slots: Array.from({ length: stage.count }, (_, slot) => `step-${index}-slot-${slot}`) }));
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
  if (rules.allowDuplicates !== undefined && typeof rules.allowDuplicates !== 'boolean') throw Error('Invalid duplicate rule');
  if (rules.heroPool !== undefined && (!Array.isArray(rules.heroPool) || rules.heroPool.length < 5
    || rules.heroPool.length > heroes.length || new Set(rules.heroPool).size !== rules.heroPool.length
    || rules.heroPool.some(id => !heroes.some(hero => hero.id === id)))) throw Error('Invalid hero pool');
  if (rules.stages !== undefined) {
    if (!Array.isArray(rules.stages) || rules.stages.length < 6 || rules.stages.length > 20) throw Error('Invalid stages');
    for (const stage of rules.stages) {
      if (!stage || typeof stage !== 'object' || Object.keys(stage).some(key => !['team', 'action', 'count'].includes(key))
        || !['blue', 'red'].includes(stage.team) || !['ban', 'pick'].includes(stage.action) || ![1, 2].includes(stage.count)) throw Error('Invalid stage');
    }
    for (const side of ['blue', 'red']) {
      const total = (action: string) => rules.stages!.filter(stage => stage.team === side && stage.action === action).reduce((sum, stage) => sum + stage.count, 0);
      if (total('pick') !== 5 || total('ban') > 5) throw Error('Each team needs five picks and zero to five bans');
    }
  }
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
  return state.draftHistory.filter(record => record.gameNumber < (state.draftGameNumber ?? state.gameNumber)
    && record.rules?.contributeToFutureHistory !== false);
}

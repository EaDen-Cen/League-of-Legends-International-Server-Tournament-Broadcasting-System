import { draftPhases, eligibleHistory } from './gameRules.js';
import { initialState, type DraftSlot, type GameDraftRecord, type MatchState, type Side, type Team } from './types.js';

export const playerIdentity = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export const seriesWins = (state: MatchState) => (Number(state.seriesFormat.slice(2)) + 1) / 2;
export const seriesFinished = (state: MatchState) => Math.max(state.blueScore, state.redScore) >= seriesWins(state);
export const ruleLocked = (state: MatchState) => state.currentPhase > 0 || state.draftHistory.length > 0;
export const currentGame = (state: MatchState) => state.draftGameNumber ?? state.gameNumber;
export const displaySides = (state: MatchState): [Side, Side] => [state.displayLeftSide, state.displayLeftSide === 'blue' ? 'red' : 'blue'];

export function draftHeroGroupKey(_state: Pick<MatchState, 'flowbornFormsIndependent'>, heroId: number) {
  return `hero:${heroId}`;
}

export function sameDraftHero(state: Pick<MatchState, 'flowbornFormsIndependent'>, leftId: number | null, rightId: number | null) {
  return leftId !== null && rightId !== null && draftHeroGroupKey(state, leftId) === draftHeroGroupKey(state, rightId);
}

export function draftHeroUsed(state: MatchState, heroId: number) {
  return [...state.blueBans, ...state.redBans, ...state.bluePicks, ...state.redPicks]
    .some(id => id !== null && sameDraftHero(state, id, heroId));
}

function historyIncludesHero(state: MatchState, ids: Array<number | null>, heroId: number) {
  return ids.some(id => sameDraftHero(state, id, heroId));
}

export function historyForTeam(record: GameDraftRecord, teamId: string) {
  if (record.blueTeam.id === teamId) return { team: record.blueTeam, bans: record.blueBans ?? [], picks: record.bluePicks, assignments: record.blueAssignments };
  if (record.redTeam.id === teamId) return { team: record.redTeam, bans: record.redBans ?? [], picks: record.redPicks, assignments: record.redAssignments };
  return undefined;
}

/** Current-game bans/duplicates are checked separately. History never consumes ban slots. */
export function pickRestriction(state: MatchState, side: Side, playerIndex: number, heroId: number | null): 'playerMissing' | 'usedByPlayer' | 'usedByTeam' | undefined {
  if (heroId === null) return;
  if (state.draftRuleMode === 'normal') return;
  const team = state[`${side}Team`];
  if (state.draftRuleMode === 'global') {
    if (eligibleHistory(state).some(record => {
      const picks = historyForTeam(record, team.id)?.picks ?? [];
      return record.id !== state.committedGameId && historyIncludesHero(state, picks, heroId);
    })) return 'usedByTeam';
    return;
  }
  const identity = playerIdentity(team.players[playerIndex] || '');
  const playerId = team.playerIds?.[playerIndex];
  if (!identity) return 'playerMissing';
  // Names are a legacy fallback; changing a display name must not reset a known player's history.
  if (eligibleHistory(state).some(record => record.id !== state.committedGameId && (['blue', 'red'] as const).some(recordSide =>
    record[`${recordSide}Team`].players.some((player, index) => {
      const recordedId = record[`${recordSide}Team`].playerIds?.[index];
      const assigned = record[`${recordSide}Assignments`][index];
      return (playerId && recordedId ? playerId === recordedId : playerIdentity(player) === identity)
        && sameDraftHero(state, assigned, heroId);
    })))) return 'usedByPlayer';
}

/** Avoid spending a ban on a hero the opposing team cannot reuse in Global BP. */
export function banRestriction(state: MatchState, side: Side, heroId: number | null): 'opponentAlreadyUsed' | undefined {
  if (heroId === null) return;
  if (state.draftRuleMode !== 'global') return;
  const opponent = state[side === 'blue' ? 'redTeam' : 'blueTeam'];
  if (eligibleHistory(state).some(record => {
    const picks = historyForTeam(record, opponent.id)?.picks ?? [];
    return record.id !== state.committedGameId && historyIncludesHero(state, picks, heroId);
  })) return 'opponentAlreadyUsed';
}

export function draftRestriction(state: MatchState, side: Side, action: 'ban' | 'pick', heroId: number) {
  if (action === 'ban') return banRestriction(state, side, heroId);
  if (state.draftRuleMode !== 'player') return pickRestriction(state, side, state[`${side}Picks`].length, heroId);

  // Help-picks mean draft order is not player ownership. During the draft a hero
  // is legal if at least one player on the team can still own it; final ownership
  // is validated atomically from assignments before commit.
  const reasons = state[`${side}Team`].players.map((_, index) => pickRestriction(state, side, index, heroId));
  if (reasons.some(reason => !reason)) return undefined;
  return reasons.includes('playerMissing') ? 'playerMissing' : 'usedByPlayer';
}

/** Upgrade every saved snapshot, including undo and delayed events. Never infer history from picks. */
export function normalizeState(raw: MatchState, matchId?: string): MatchState {
  const defaults = initialState();
  // Imported backups are a trust boundary; unknown fields must never enter any public snapshot.
  raw = sanitizeState(raw, defaults);
  const normalizeTeam = (team: Partial<Team> | undefined, side: Side, current = true): Team => {
    const fallback = defaults[`${side}Team`];
    return { ...fallback, ...team, id: team?.id || fallback.id,
      players: Array.from({ length: 5 }, (_, i) => team?.players?.[i] ?? ''),
      playerIds: !current && !team?.playerIds ? undefined : Array.from({ length: 5 }, (_, i) => team?.playerIds?.[i] || `${team?.id || fallback.id}-p${i + 1}`),
      playerRoles: Array.from({ length: 5 }, (_, i) => team?.playerRoles?.[i] ?? fallback.playerRoles[i]),
      playerPortraits: Array.from({ length: 5 }, (_, i) => team?.playerPortraits?.[i] ?? ''),
    };
  };
  const normalizeAssignments = (value: Array<number | null> | undefined, picks: Array<number | null>) =>
    Array.from({ length: 5 }, (_, index) => value ? (value[index] ?? null) : (picks[index] ?? null));
  const state = { ...defaults, ...raw,
    blueTeam: normalizeTeam(raw.blueTeam, 'blue'), redTeam: normalizeTeam(raw.redTeam, 'red'),
    blueAssignments: normalizeAssignments(raw.blueAssignments, raw.bluePicks ?? []),
    redAssignments: normalizeAssignments(raw.redAssignments, raw.redPicks ?? []),
    showHeroName: raw.showHeroName ?? true,
    roleIconStyle: raw.roleIconStyle ?? 'minimal',
    roleIconBackground: raw.roleIconBackground ?? 'light',
    artSourceMode: raw.artSourceMode ?? 'auto',
    heroArtOverrides: raw.heroArtOverrides ?? {},
    heroDataOverrides: raw.heroDataOverrides ?? {},
    draftHistory: (raw.draftHistory ?? []).map(record => ({ ...record,
      firstPickSide: record.firstPickSide ?? 'blue',
      blueTeam: normalizeTeam(record.blueTeam, 'blue', false), redTeam: normalizeTeam(record.redTeam, 'red', false),
      blueBans: [...(record.blueBans ?? [])],
      redBans: [...(record.redBans ?? [])],
      blueAssignments: [...(record.blueAssignments ?? record.bluePicks)],
      redAssignments: [...(record.redAssignments ?? record.redPicks)],
    })),
  };
  // Old archives use independent games. Upgrading must not silently impose Global BP.
  state.draftRuleMode = raw.draftRuleMode ?? 'normal';
  // Old automatic-input archives must never reactivate a BP writer.
  state.bpInputMode = 'manual';
  state.flowbornFormsIndependent = raw.flowbornFormsIndependent ?? true;
  state.displayLeftSide = raw.displayLeftSide ?? 'blue';
  state.firstPickSide = raw.firstPickSide ?? 'blue';
  state.sideSwapMode = raw.sideSwapMode ?? 'moveTeams';
  state.draftGameNumber = raw.draftGameNumber ?? (raw.currentPhase > 0 ? raw.gameNumber : null);
  state.matchId = raw.matchId || matchId || defaults.matchId;
  state.gameId = raw.gameId || raw.committedGameId || `${state.matchId}-game-${state.draftGameNumber ?? state.gameNumber}`;
  state.bpPaused = raw.bpPaused ?? false;
  state.ruleConflicts = raw.ruleConflicts ?? [];
  state.lineupConfirmedTeamIds = raw.lineupConfirmedTeamIds ?? [];
  state.draftSlots = raw.draftSlots ?? slotsFromLegacy(state);
  state.draftHistory = state.draftHistory.map(record => ({ ...record,
    draftSlots: record.draftSlots ?? slotsFromLegacy({ ...state, ...record, currentGameRules: record.rules,
      draftMode: record.rules?.draftMode ?? state.draftMode, firstPickSide: record.firstPickSide,
      currentPhase: Number.MAX_SAFE_INTEGER }),
  }));
  return state;
}

function fields<T>(value: T, names: readonly string[]): T {
  return Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([key]) => names.includes(key))) as T;
}
const teamFields = ['id','name','logo','players','playerIds','playerRoles','playerPortraits'];
const ruleFields = ['draftMode','draftRuleMode','firstPickSide','sideSwapMode','enforcePreviousHistory','contributeToFutureHistory','stages','heroPool','allowDuplicates'];
const recordFields = ['id','gameNumber','committedAt','blueTeam','redTeam','rules','firstPickSide','blueBans','redBans','bluePicks','redPicks','blueAssignments','redAssignments','draftSlots','currentPhase','draftComplete','lineupConfirmedTeamIds'];
export function sanitizeGameRules<T extends Partial<import('./types.js').GameRules>>(input: T): T {
  const value = fields(input, ruleFields);
  if (Array.isArray(value.stages)) value.stages = value.stages.map(stage => fields(stage, ['team','action','count']));
  return value;
}
const cleanSlots = (input: Record<string, DraftSlot> | undefined) => input && Object.fromEntries(Object.entries(input).map(([id, slot]) => [id, fields(slot, ['status','heroId','assignmentIndex'])]));
function sanitizeState(input: MatchState, defaults: MatchState): MatchState {
  const value = fields(input, [...Object.keys(defaults),'seriesRules','currentGameRules']);
  value.blueTeam = fields(value.blueTeam, teamFields);
  value.redTeam = fields(value.redTeam, teamFields);
  if (value.currentGameRules) value.currentGameRules = sanitizeGameRules(value.currentGameRules);
  if (value.seriesRules) value.seriesRules = {defaultGameRules:sanitizeGameRules(value.seriesRules.defaultGameRules),
    games:Object.fromEntries(Object.entries(value.seriesRules.games ?? {}).map(([key, rules]) => [key,sanitizeGameRules(rules)]))};
  if (value.draftSlots) value.draftSlots = cleanSlots(value.draftSlots)!;
  if (Array.isArray(value.ruleConflicts)) value.ruleConflicts = value.ruleConflicts.map(conflict => fields(conflict,['gameId','reason']));
  if (value.heroDataOverrides) value.heroDataOverrides = Object.fromEntries(Object.entries(value.heroDataOverrides).map(([id, override]) => [id,fields(override,['englishName','chineseName','occupation','altOccupation','aliases','imageLink','artLink'])]));
  if (value.heroArtOverrides) value.heroArtOverrides = Object.fromEntries(Object.entries(value.heroArtOverrides).map(([id, override]) => {
    const art = fields(override,['useLegacyImage','panel','side']);
    if (art.panel) art.panel = fields(art.panel,['x','y','scale']);
    if (art.side) art.side = fields(art.side,['x','y','scale']);
    return [id,art];
  }));
  if (Array.isArray(value.draftHistory)) value.draftHistory = value.draftHistory.map(rawRecord => {
    const record = fields(rawRecord,recordFields);
    record.blueTeam = fields(record.blueTeam,teamFields); record.redTeam = fields(record.redTeam,teamFields);
    if (record.rules) record.rules = sanitizeGameRules(record.rules);
    if (record.draftSlots) record.draftSlots = cleanSlots(record.draftSlots);
    return record;
  });
  return value;
}

/** Slot identity survives clearing; null in the legacy arrays is never used to infer a skip. */
export function slotsFromLegacy(state: MatchState): Record<string, DraftSlot> {
  const offsets = { blueban: 0, redban: 0, bluepick: 0, redpick: 0 };
  const slots: Record<string, DraftSlot> = {};
  draftPhases(state).forEach((phase, step) => phase.slots.forEach(slotId => {
    const ids = state[`${phase.team}${phase.action === 'ban' ? 'Bans' : 'Picks'}`];
    const index = offsets[`${phase.team}${phase.action}`]++;
    const heroId = ids[index];
    slots[slotId] = typeof heroId === 'number' ? { status: 'selected', heroId }
      : heroId === null && phase.action === 'ban' && step < state.currentPhase ? { status: 'skipped' } : { status: 'empty' };
  }));
  return slots;
}

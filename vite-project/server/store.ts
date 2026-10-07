import { existsSync, mkdirSync, readFileSync, renameSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import type { TeamPresetStore } from './teamPresets.js';
import { dirname } from 'node:path';
import heroes from '../src/components/HeroList.js';
import { initialState, phases, type Action, type HeroDataOverride, type MatchState, type Role, type Snapshot } from '../src/shared/types.js';
import { currentGame, draftHeroGroupKey, draftHeroUsed, draftRestriction, normalizeState, pickRestriction, playerIdentity, ruleLocked, seriesFinished } from '../src/shared/draftRules.js';

interface Event { id: string; timestamp: number; type: string; resultingState: MatchState; revision: number }
interface Data { version: 1; state: MatchState; events: Event[]; history: MatchState[]; revision: number; delay: number; ids: string[] }
const copy = <T>(v: T): T => structuredClone(v);
function integer(v: unknown, min: number, max: number): asserts v is number {
  if (!Number.isInteger(v) || Number(v) < min || Number(v) > max) throw new Error(`请输入 ${min} 至 ${max} 之间的整数`);
}
function shortText(v: unknown, max: number): asserts v is string {
  if (typeof v !== 'string' || v.length > max) throw new Error(`文字格式不正确，最多可输入 ${max} 个字符`);
}
function validateArtCrop(crop: unknown) {
  if (!crop || typeof crop !== 'object') throw new Error('heroArtCropInvalid');
  const value = crop as { x?: unknown; y?: unknown; scale?: unknown };
  if (typeof value.x !== 'number' || !Number.isFinite(value.x) || value.x < 0 || value.x > 100) throw new Error('heroArtCropInvalid');
  if (typeof value.y !== 'number' || !Number.isFinite(value.y) || value.y < 0 || value.y > 100) throw new Error('heroArtCropInvalid');
  if (typeof value.scale !== 'number' || !Number.isFinite(value.scale) || value.scale < 1 || value.scale > 3) throw new Error('heroArtCropInvalid');
}
function portraitURL(value: unknown): asserts value is string {
  shortText(value, 1000);
  if (!value) return;
  if (/\s|\\/.test(value) || [...value].some(char => char.charCodeAt(0) < 32)) throw new Error('portraitInvalid');
  if (/^\/(?!\/)/.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return;
  } catch { /* Reject invalid URLs below. */ }
  throw new Error('portraitInvalid');
}
function clearDraft(state: MatchState) {
  Object.assign(state, {
    blueBans: [], redBans: [], bluePicks: [], redPicks: [],
    blueAssignments: [null, null, null, null, null],
    redAssignments: [null, null, null, null, null],
    currentPhase: 0, draftComplete: false, draftGameNumber: null, committedGameId: null,
  });
}
function validateScores(blue: number, red: number, format: MatchState['seriesFormat']) {
  integer(blue, 0, 3); integer(red, 0, 3);
  const wins = (Number(format.slice(2)) + 1) / 2;
  if (blue > wins || red > wins || (blue === wins && red === wins)) throw new Error('比分或局数不符合当前赛制');
}
function casterViewState(current: MatchState, delayed?: MatchState): MatchState {
  const view = copy(delayed ?? initialState());

  // Tournament identity and presentation are configuration, not hidden gameplay.
  // Keep them live so the caster desk is useful immediately, while draft
  // progress, scores and committed history continue to follow the delay buffer.
  view.blueTeam = copy(current.blueTeam);
  view.redTeam = copy(current.redTeam);
  view.seriesFormat = current.seriesFormat;
  view.stage = current.stage;
  view.language = current.language;
  view.overlayLayout = current.overlayLayout;
  view.scoreDisplay = current.scoreDisplay;
  view.bpInputMode = current.bpInputMode;
  view.roleIconStyle = current.roleIconStyle;
  view.roleIconBackground = current.roleIconBackground;
  view.showHeroName = current.showHeroName;
  view.artSourceMode = current.artSourceMode;
  view.heroArtOverrides = copy(current.heroArtOverrides || {});
  view.heroDataOverrides = copy(current.heroDataOverrides || {});
  view.draftMode = current.draftMode;
  view.firstPickSide = current.firstPickSide;
  view.sideSwapMode = current.sideSwapMode;
  view.draftRuleMode = current.draftRuleMode;
  view.flowbornFormsIndependent = current.flowbornFormsIndependent;
  return view;
}

function validateLineup(state: MatchState, requireComplete = state.draftComplete) {
  for (const side of ['blue', 'red'] as const) {
    const picks = state[`${side}Picks`];
    const assignments = state[`${side}Assignments`];
    if (!Array.isArray(assignments) || assignments.length !== 5) throw new Error('lineupInvalid');
    const assigned = assignments.filter((heroId): heroId is number => heroId !== null);
    if (new Set(assigned.map(heroId => draftHeroGroupKey(state, heroId))).size !== assigned.length || assigned.some(heroId => !picks.includes(heroId))) throw new Error('lineupInvalid');
    if (requireComplete) {
      if (picks.length !== 5 || assigned.length !== 5 || picks.some(heroId => !assigned.includes(heroId))) throw new Error('lineupIncomplete');
      if (state.draftRuleMode === 'player') {
        assignments.forEach((heroId, index) => {
          if (heroId === null) throw new Error('lineupIncomplete');
          const reason = pickRestriction(state, side, index, heroId);
          if (reason) throw new Error(reason);
        });
      }
    }
  }
}
export class Store {
  data: Data;
  constructor(private file?: string, private clock = Date.now, private presets?: TeamPresetStore) {
    this.data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {
      version: 1, state: initialState(), events: [], history: [], revision: 0, delay: 180, ids: [],
    };
    if (this.data.version !== 1 || !Array.isArray(this.data.events) || !Array.isArray(this.data.history)) throw new Error('比赛存档无效，请恢复有效备份');
    this.data.state = normalizeState(this.data.state);
    this.data.history = this.data.history.map(normalizeState);
    this.data.events = this.data.events.map(event => ({ ...event, resultingState: normalizeState(event.resultingState) }));
  }
  snapshot(role: Role): Snapshot {
    if (role === 'caster') {
      const cutoff = this.clock() - this.data.delay * 1000;

      const event = [...this.data.events]
        .reverse()
        .find(e => e.timestamp <= cutoff);

      return {
        type: 'match_state_update',
        // Before the delayed timeline has any eligible event, expose only
        // non-sensitive tournament/team metadata instead of an empty default
        // board. Draft progress, scores and history remain delayed.
        state: casterViewState(this.data.state, event?.resultingState),
        revision: event?.revision ?? 0,
        casterDelaySeconds: this.data.delay,
      };
    }

    return {
      type: 'match_state_update',
      state: copy(this.data.state),
      revision: this.data.revision,
      ...(role === 'control'
        ? {
          casterDelaySeconds: this.data.delay,
          canUndo: this.data.history.length > 0,
        }
        : {}),
    };
  }
  apply(id: string, revision: number, action: Action) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(id)) throw new Error('操作编号无效，请刷新页面后重试');
    if (this.data.ids.includes(id)) return;
    if (revision !== this.data.revision) throw new Error('比赛状态已更新，请确认当前选禁结果后重试');
    if (!action || typeof action !== 'object') throw new Error('操作无效');
    const next = copy(this.data);
    const state = next.state;
    switch (action.type) {
    case 'load_team_preset': {
      if (state.currentPhase !== 0 || state.draftHistory.length || state.committedGameId) throw new Error('presetLocked');
      if (!['blue', 'red'].includes(action.side)) throw new Error('presetInvalid');
      const preset = this.presets?.get(action.presetId);
      if (!preset) throw new Error('presetMissing');
      const other = state[action.side === 'blue' ? 'redTeam' : 'blueTeam'];
      if (other.id === preset.id) throw new Error('presetDuplicate');
      if (state.draftRuleMode === 'player') {
        const ids = [...other.players, ...preset.players].map(playerIdentity).filter(Boolean);
        if (new Set(ids).size !== ids.length) throw new Error('duplicatePlayerIds');
      }
      next.history.push(copy(state));
      state[action.side === 'blue' ? 'blueTeam' : 'redTeam'] = { id: preset.id, name: preset.name, logo: preset.logo, players: [...preset.players], playerRoles: [...preset.playerRoles], playerPortraits: [...preset.playerPortraits] };
      break;
    }
    case 'draft_action': {
      if (state.committedGameId) throw new Error('gameAlreadyCommitted');
      if (state.draftRuleMode === 'player' && [...state.blueTeam.players, ...state.redTeam.players].some(player => !playerIdentity(player))) throw new Error('playerMissing');
      if (state.currentPhase === 0 && (seriesFinished(state) || state.draftHistory.some(game => game.gameNumber >= state.gameNumber))) throw new Error('updateScoreBeforeNext');
      const phase = phases(state.draftMode, state.firstPickSide)[state.currentPhase];
      if (!phase || phase.team !== action.team || phase.action !== action.action) throw new Error('当前选禁阶段不支持此操作，请确认轮次和队伍');
      if (!heroes.some(h => h.id === action.heroId)) throw new Error('找不到该英雄');
      if (draftHeroUsed(state, action.heroId)) throw new Error('该英雄已被选择或禁用');
      const reason = draftRestriction(state, phase.team, phase.action, action.heroId);
      if (reason) throw new Error(reason);
      next.history.push(copy(state));
      state.draftGameNumber ??= state.gameNumber;
      state[`${phase.team}${phase.action === 'ban' ? 'Bans' : 'Picks'}`].push(action.heroId);
      if (phase.action === 'pick') {
        const assignmentIndex = state[`${phase.team}Picks`].length - 1;
        state[`${phase.team}Assignments`][assignmentIndex] = action.heroId;
      }
      state.currentPhase++;
      state.draftComplete = state.currentPhase === phases(state.draftMode, state.firstPickSide).length;
      break;
    }
    case 'skip_ban': {
      if (state.committedGameId) throw new Error('gameAlreadyCommitted');
      if (state.draftRuleMode === 'player' && [...state.blueTeam.players, ...state.redTeam.players].some(player => !playerIdentity(player))) throw new Error('playerMissing');
      if (state.currentPhase === 0 && (seriesFinished(state) || state.draftHistory.some(game => game.gameNumber >= state.gameNumber))) throw new Error('updateScoreBeforeNext');
      const phase = phases(state.draftMode, state.firstPickSide)[state.currentPhase];
      if (!phase || phase.team !== action.team || phase.action !== 'ban') throw new Error('emptyBanOnlyDuringBan');
      next.history.push(copy(state));
      state.draftGameNumber ??= state.gameNumber;
      state[`${phase.team}Bans`].push(null);
      state.currentPhase++;
      state.draftComplete = state.currentPhase === phases(state.draftMode, state.firstPickSide).length;
      break;
    }
    case 'commit_game': {
      if (state.committedGameId || state.draftHistory.some(game => game.gameNumber === currentGame(state))) throw new Error('gameAlreadyCommitted');
      if (!state.draftComplete || state.bluePicks.length !== 5 || state.redPicks.length !== 5) throw new Error('completeDraftFirst');
      validateLineup(state, true);
      next.history.push(copy(state));
      state.draftHistory.push({
        id, firstPickSide: state.firstPickSide, gameNumber: currentGame(state), committedAt: this.clock(),
        blueTeam: copy(state.blueTeam), redTeam: copy(state.redTeam),
        blueBans: [...state.blueBans], redBans: [...state.redBans],
        bluePicks: [...state.bluePicks], redPicks: [...state.redPicks],
        blueAssignments: [...state.blueAssignments] as number[],
        redAssignments: [...state.redAssignments] as number[],
      });
      state.committedGameId = id;
      break;
    }
    case 'next_game': {
      if (!state.committedGameId) throw new Error('commitBeforeNext');
      if (seriesFinished(state)) throw new Error('seriesHasEnded');
      if (state.gameNumber !== currentGame(state) + 1) throw new Error('updateScoreBeforeNext');
      next.history.push(copy(state)); clearDraft(state); break;
    }
    case 'swap_sides': {
      if (state.currentPhase > 0 || state.committedGameId) throw new Error('swapOnlyBetweenGames');
      next.history.push(copy(state));
      [state.blueTeam, state.redTeam] = [state.redTeam, state.blueTeam];
      [state.blueScore, state.redScore] = [state.redScore, state.blueScore];
      if (state.sideSwapMode === 'colorsOnly') state.displayLeftSide = state.displayLeftSide === 'blue' ? 'red' : 'blue';
      break;
    }
    case 'swap_picks':
    case 'swap_assignments': {
      if (state.committedGameId) throw new Error('gameAlreadyCommitted');
      if (!state.draftComplete) throw new Error('completeDraftFirst');
      if (!['blue', 'red'].includes(action.team)) throw new Error('操作无效');
      integer(action.from, 0, 4); integer(action.to, 0, 4);
      next.history.push(copy(state));
      const assignments = state[`${action.team}Assignments`];
      [assignments[action.from], assignments[action.to]] = [assignments[action.to], assignments[action.from]];
      validateLineup(state, true);
      break;
    }
    case 'set_lineup_assignments': {
      if (state.committedGameId) throw new Error('gameAlreadyCommitted');
      if (!state.draftComplete) throw new Error('completeDraftFirst');
      for (const lineup of [action.blue, action.red]) {
        if (!Array.isArray(lineup) || lineup.length !== 5 || lineup.some(heroId => !Number.isInteger(heroId))) throw new Error('lineupInvalid');
      }
      next.history.push(copy(state));
      state.blueAssignments = [...action.blue];
      state.redAssignments = [...action.red];
      validateLineup(state, true);
      break;
    }
    case 'score': {
      if (!['blue', 'red'].includes(action.team) || ![1, -1].includes(action.delta)) throw new Error('操作无效');
      next.history.push(copy(state));
      state[`${action.team}Score`] += action.delta;
      validateScores(state.blueScore, state.redScore, state.seriesFormat);
      state.gameNumber = Math.min(state.blueScore + state.redScore + 1, Number(state.seriesFormat.slice(2)));
      break;
    }
    case 'undo': {
      const previous = next.history.pop();
      if (!previous) throw new Error('没有可以撤销的操作');
      next.state = previous;
      break;
    }
    case 'reset_draft':
      if (state.committedGameId) throw new Error('committedDraftReset');
      next.history.push(copy(state));
      clearDraft(state);
      break;
    case 'reset_match': {
      next.history.push(copy(state));
      const reset = initialState();

      // Reset match progress, but keep tournament configuration. A director
      // should not have to rebuild the event identity/rules after clearing a match.
      reset.stage = state.stage;
      reset.seriesFormat = state.seriesFormat;
      reset.draftMode = state.draftMode;
      reset.draftRuleMode = state.draftRuleMode;
      reset.flowbornFormsIndependent = state.flowbornFormsIndependent;
      reset.firstPickSide = state.firstPickSide;
      reset.sideSwapMode = state.sideSwapMode;
      reset.language = state.language;
      reset.overlayLayout = state.overlayLayout;
      reset.scoreDisplay = state.scoreDisplay;
      reset.bpInputMode = state.bpInputMode;

      reset.heroArtOverrides = copy(state.heroArtOverrides || {});
      reset.heroDataOverrides = copy(state.heroDataOverrides || {});
      reset.showHeroName = state.showHeroName ?? true;
      reset.roleIconStyle = state.roleIconStyle ?? 'minimal';
      reset.roleIconBackground = state.roleIconBackground ?? 'light';
      reset.artSourceMode = state.artSourceMode ?? 'auto';
      next.state = reset;
      break;
    }
    case 'settings': {
      const s = action.settings;
      if (
        !s ||
        !['BO1', 'BO3', 'BO5'].includes(s.seriesFormat) ||
        !['match', 'normal'].includes(s.draftMode) ||
        !['normal', 'player', 'global'].includes(s.draftRuleMode ?? state.draftRuleMode) ||
        !['blue', 'red'].includes(s.firstPickSide ?? state.firstPickSide) ||
        !['moveTeams', 'colorsOnly'].includes(s.sideSwapMode ?? state.sideSwapMode) ||
        !['zh', 'eng'].includes(s.language) ||
        !['panel', 'side'].includes(s.overlayLayout) ||
        !['number', 'boxes'].includes(s.scoreDisplay ?? state.scoreDisplay ?? 'number') ||
        !['manual', 'lcu', 'screen'].includes(s.bpInputMode ?? state.bpInputMode ?? 'manual') ||
        !['minimal', 'ornate'].includes(s.roleIconStyle ?? state.roleIconStyle ?? 'minimal') ||
        !['light', 'dark'].includes(s.roleIconBackground ?? state.roleIconBackground ?? 'light') ||
        typeof (s.showHeroName ?? state.showHeroName) !== 'boolean' ||
        typeof (s.flowbornFormsIndependent ?? state.flowbornFormsIndependent) !== 'boolean' ||
        !['auto', 'legacy'].includes(s.artSourceMode ?? state.artSourceMode ?? 'auto')
      ) {
        throw new Error('比赛设置无效，请检查赛制、语言和画面布局');
      }
      integer(s.blueScore, 0, 3); integer(s.redScore, 0, 3); integer(s.gameNumber, 1, 5);
      const wins = (Number(s.seriesFormat.slice(2)) + 1) / 2;
      if (s.blueScore > wins || s.redScore > wins || (s.blueScore === wins && s.redScore === wins) || s.gameNumber > Number(s.seriesFormat.slice(2))) throw new Error('比分或局数不符合当前赛制');
      shortText(s.stage, 80);
      const draftRuleMode = s.draftRuleMode ?? state.draftRuleMode;
      const firstPickSide = s.firstPickSide ?? state.firstPickSide;
      const flowbornFormsIndependent = s.flowbornFormsIndependent ?? state.flowbornFormsIndependent;
      if (state.currentPhase > 0 && firstPickSide !== state.firstPickSide) throw new Error('firstPickLocked');
      if (ruleLocked(state) && (draftRuleMode !== state.draftRuleMode || flowbornFormsIndependent !== state.flowbornFormsIndependent)) throw new Error('rulesLocked');
      if (state.draftHistory.length && s.seriesFormat !== state.seriesFormat) throw new Error('rulesLocked');
      for (const team of [s.blueTeam, s.redTeam]) {
        if (!team) throw new Error('请填写队伍信息');

        shortText(team.name, 60);
        shortText(team.logo, 1000);

        if (!Array.isArray(team.players) || team.players.length !== 5) {
          throw new Error('每支队伍必须填写 5 个选手位置');
        }

        if (!Array.isArray(team.playerRoles) || team.playerRoles.length !== 5) {
          throw new Error('每支队伍必须设置 5 个选手分路');
        }
        if (team.playerPortraits !== undefined) {
          if (!Array.isArray(team.playerPortraits) || team.playerPortraits.length !== 5) throw new Error('portraitsInvalid');
          team.playerPortraits.forEach(portraitURL);
        }

        const validRoles = ['top', 'jungle', 'mid', 'bot', 'support'];

        for (const role of team.playerRoles) {
          if (!validRoles.includes(role)) {
            throw new Error('选手分路无效');
          }
        }

        for (const player of team.players) {
          shortText(player, 40);
        }

        if (!team.name.trim()) {
          throw new Error('队伍名称不能为空');
        }

        if (
          team.logo &&
          !/^https:\/\//.test(team.logo) &&
          !/^\/(?!\/)/.test(team.logo)
        ) {
          throw new Error('队标地址须使用加密网页链接，或以单个斜线开头的本地路径');
        }
      }
      if (draftRuleMode === 'player') {
        const identities = [...s.blueTeam.players, ...s.redTeam.players].map(playerIdentity).filter(Boolean);
        if (new Set(identities).size !== identities.length) throw new Error('duplicatePlayerIds');
      }
      if (state.currentPhase > 0 && s.draftMode !== state.draftMode) throw new Error('请先重置选禁，再修改选禁赛制');
      next.history.push(copy(state));
      Object.assign(state, {
        blueTeam: {
          id: state.blueTeam.id,
          name: s.blueTeam.name,
          logo: s.blueTeam.logo,
          players: [...s.blueTeam.players],
          playerRoles: [...s.blueTeam.playerRoles],
          playerPortraits: [...(s.blueTeam.playerPortraits ?? state.blueTeam.playerPortraits)],
        },
        redTeam: {
          id: state.redTeam.id,
          name: s.redTeam.name,
          logo: s.redTeam.logo,
          players: [...s.redTeam.players],
          playerRoles: [...s.redTeam.playerRoles],
          playerPortraits: [...(s.redTeam.playerPortraits ?? state.redTeam.playerPortraits)],
        },

        blueScore: s.blueScore,
        redScore: s.redScore,

        gameNumber: Math.min(
          s.blueScore + s.redScore + 1,
          Number(s.seriesFormat.slice(2))
        ),
        seriesFormat: s.seriesFormat,
        stage: s.stage,

        language: s.language,
        overlayLayout: s.overlayLayout,
        scoreDisplay: s.scoreDisplay ?? state.scoreDisplay ?? 'number',
        bpInputMode: s.bpInputMode ?? state.bpInputMode ?? 'manual',
        roleIconStyle: s.roleIconStyle ?? state.roleIconStyle ?? 'minimal',
        roleIconBackground: s.roleIconBackground ?? state.roleIconBackground ?? 'light',
        showHeroName: s.showHeroName ?? state.showHeroName ?? true,
        artSourceMode: s.artSourceMode ?? state.artSourceMode ?? 'auto',

        draftMode: s.draftMode,
        draftRuleMode,
        flowbornFormsIndependent,
        firstPickSide,
        sideSwapMode: s.sideSwapMode ?? state.sideSwapMode,
      });
      // Live roster corrections must respect the incoming player’s previous picks.
      // Committed records remain immutable snapshots of the game already played.
      if (state.currentPhase > 0 && !state.committedGameId) {
        if (state.draftRuleMode === 'player' && [...state.blueTeam.players, ...state.redTeam.players].some(player => !playerIdentity(player))) throw new Error('playerMissing');
        if (state.draftComplete) validateLineup(state, true);
      }
      break;
    }
    case 'hero_art_override': {
      if (!heroes.some(hero => hero.id === action.heroId)) throw new Error('找不到该英雄');
      const override = action.override;
      if (!override || typeof override !== 'object') throw new Error('heroArtOverrideInvalid');
      if (override.useLegacyImage !== undefined && typeof override.useLegacyImage !== 'boolean') throw new Error('heroArtOverrideInvalid');
      if (override.panel !== undefined) validateArtCrop(override.panel);
      if (override.side !== undefined) validateArtCrop(override.side);
      next.history.push(copy(state));
      state.heroArtOverrides = { ...(state.heroArtOverrides || {}), [String(action.heroId)]: copy(override) };
      break;
    }
    case 'hero_data_override': {
      const baseHero = heroes.find(hero => hero.id === action.heroId);
      if (!baseHero) throw new Error('找不到该英雄');
      const override = action.override;
      if (!override || typeof override !== 'object') throw new Error('heroDataOverrideInvalid');
      if (override.englishName !== undefined) { shortText(override.englishName, 60); if (!override.englishName.trim()) throw new Error('heroDataOverrideInvalid'); }
      if (override.chineseName !== undefined) { shortText(override.chineseName, 60); if (!override.chineseName.trim()) throw new Error('heroDataOverrideInvalid'); }
      const validLanes = ['', 'Top Lane', 'Jungle', 'Mid Lane', 'Bot Lane', 'Support'];
      if (override.occupation !== undefined && !validLanes.includes(override.occupation)) throw new Error('heroDataOverrideInvalid');
      if (override.altOccupation !== undefined && !validLanes.includes(override.altOccupation)) throw new Error('heroDataOverrideInvalid');
      if (override.aliases !== undefined) {
        if (!Array.isArray(override.aliases) || override.aliases.length > 20) throw new Error('heroDataOverrideInvalid');
        override.aliases.forEach(alias => shortText(alias, 60));
      }
      if (override.imageLink !== undefined) {
        if (!override.imageLink.trim()) throw new Error('heroDataOverrideInvalid');
        portraitURL(override.imageLink);
      }
      if (override.artLink !== undefined) {
        if (!override.artLink.trim()) throw new Error('heroDataOverrideInvalid');
        portraitURL(override.artLink);
      }
      const normalized: HeroDataOverride = {};
      if (override.englishName !== undefined && override.englishName.trim() !== baseHero.englishName) normalized.englishName = override.englishName.trim();
      if (override.chineseName !== undefined && override.chineseName.trim() !== baseHero.chineseName) normalized.chineseName = override.chineseName.trim();
      if (override.occupation !== undefined && override.occupation !== baseHero.occupation) normalized.occupation = override.occupation;
      if (override.altOccupation !== undefined && override.altOccupation !== (baseHero.altOccupation ?? '')) normalized.altOccupation = override.altOccupation;
      if (override.aliases !== undefined) {
        const aliases = [...new Set(override.aliases.map(alias => alias.trim()).filter(Boolean))];
        if (JSON.stringify(aliases) !== JSON.stringify(baseHero.aliases ?? [])) normalized.aliases = aliases;
      }
      if (override.imageLink !== undefined && override.imageLink !== baseHero.imageLink) normalized.imageLink = override.imageLink;
      if (override.artLink !== undefined && override.artLink !== (baseHero.artLink ?? '')) normalized.artLink = override.artLink;

      next.history.push(copy(state));
      const map = { ...(state.heroDataOverrides || {}) };
      if (Object.keys(normalized).length) map[String(action.heroId)] = copy(normalized);
      else delete map[String(action.heroId)];
      state.heroDataOverrides = map;
      break;
    }
    case 'reset_hero_data_override': {
      if (!heroes.some(hero => hero.id === action.heroId)) throw new Error('找不到该英雄');
      next.history.push(copy(state));
      const map = { ...(state.heroDataOverrides || {}) };
      delete map[String(action.heroId)];
      state.heroDataOverrides = map;
      break;
    }
    case 'reset_hero_art_override': {
      if (!heroes.some(hero => hero.id === action.heroId)) throw new Error('找不到该英雄');
      next.history.push(copy(state));
      const key = String(action.heroId);
      const current = { ...(state.heroArtOverrides?.[key] || {}) };
      if (action.layout) {
        if (!['panel', 'side'].includes(action.layout)) throw new Error('heroArtOverrideInvalid');
        delete current[action.layout];
        if (current.useLegacyImage === undefined && current.panel === undefined && current.side === undefined) {
          const map = { ...(state.heroArtOverrides || {}) };
          delete map[key];
          state.heroArtOverrides = map;
        } else {
          state.heroArtOverrides = { ...(state.heroArtOverrides || {}), [key]: current };
        }
      } else {
        const map = { ...(state.heroArtOverrides || {}) };
        delete map[key];
        state.heroArtOverrides = map;
      }
      break;
    }
    case 'delay': integer(action.seconds, 0, 3600); next.delay = action.seconds; break;
    default: throw new Error('不支持此操作');
    }
    next.revision++;
    if (action.type !== 'delay') next.events.push({ id, timestamp: Math.max(this.clock(), next.events.at(-1)?.timestamp ?? 0), type: action.type, resultingState: copy(next.state), revision: next.revision });
    next.ids = [...next.ids.slice(-999), id];
    // Commit durable state before acknowledging or broadcasting. Failure leaves memory unchanged.
    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        const fd = openSync(temporary, 'w');
        try { writeSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(temporary, this.file);
      } catch (cause) {
        throw new Error('比赛状态保存失败，本次操作未生效，请联系导播检查服务器存储后重试', { cause });
      }
    }
    this.data = next;
  }
}

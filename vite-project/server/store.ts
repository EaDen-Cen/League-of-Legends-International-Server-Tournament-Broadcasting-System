import { applyGameRules, gameRulesFor, gameRulesLocked, legacyGameRules, sameGameRules, validateSeriesRules, validateGameRules, draftPhases } from '../src/shared/gameRules.js';
import { existsSync, mkdirSync, readFileSync, renameSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import type { TeamPresetStore } from './teamPresets.js';
import { dirname } from 'node:path';
import heroes from '../src/components/HeroList.js';
import { initialState, type Action, type DraftSlot, type GameDraftRecord, type HeroDataOverride, type MatchState, type Role, type Snapshot } from '../src/shared/types.js';
import { currentGame, draftRestriction, normalizeState, slotsFromLegacy, pickRestriction, playerIdentity, ruleLocked, seriesFinished } from '../src/shared/draftRules.js';

interface Event { id: string; timestamp: number; type: string; resultingState: MatchState; previousState?: MatchState; revision: number; actor?: {role: 'control' | 'captain'; teamId?: string}; reason?: string }
interface Data { version: 1; state: MatchState; events: Event[]; history: MatchState[]; revision: number; ids: string[] }
const copy = <T>(v: T): T => structuredClone(v);
function persist(file: string | undefined, data: Data) {
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    const fd = openSync(temporary, 'w');
    try { writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, file);
  } catch (cause) {
    throw new Error('比赛状态保存失败，本次操作未生效，请联系导播检查服务器存储后重试', { cause });
  }
}
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
function clearDraft(state: MatchState, newGame = false) {
  Object.assign(state, {
    blueBans: [], redBans: [], bluePicks: [], redPicks: [],
    blueAssignments: [null, null, null, null, null],
    redAssignments: [null, null, null, null, null],
    currentPhase: 0, draftComplete: false, draftGameNumber: null, committedGameId: null,
    bpPaused: false, draftSlots: {}, ruleConflicts: [], lineupConfirmedTeamIds: [],
  });
  if (newGame) { state.gameId = globalThis.crypto.randomUUID(); delete state.currentGameRules; }
}
function validateScores(blue: number, red: number, format: MatchState['seriesFormat']) {
  integer(blue, 0, 4); integer(red, 0, 4);
  const wins = (Number(format.slice(2)) + 1) / 2;
  if (blue > wins || red > wins || (blue === wins && red === wins)) throw new Error('比分或局数不符合当前赛制');
}
function validateLineup(state: MatchState, requireComplete = state.draftComplete) {
  for (const side of ['blue', 'red'] as const) {
    const picks = state[`${side}Picks`];
    const assignments = state[`${side}Assignments`];
    if (!Array.isArray(assignments) || assignments.length !== 5) throw new Error('lineupInvalid');
    const assigned = assignments.filter((heroId): heroId is number => heroId !== null);
    if (assigned.some(heroId => assigned.filter(id => id === heroId).length > picks.filter(id => id === heroId).length)) throw new Error('lineupInvalid');
    if (requireComplete) {
      if (picks.length !== 5 || picks.includes(null) || assigned.length !== 5 || picks.some(heroId => heroId === null || !assigned.includes(heroId))) throw new Error('lineupIncomplete');
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
function ensureSlots(state: MatchState) {
  if (!Object.keys(state.draftSlots).length) state.draftSlots = slotsFromLegacy(state);
}
function projectSlots(state: MatchState) {
  ensureSlots(state);
  for (const team of ['blue', 'red'] as const) for (const action of ['ban', 'pick'] as const) {
    const entries = draftPhases(state).flatMap((phase, step) => phase.team === team && phase.action === action
      ? phase.slots.map(slotId => ({ step, slot: state.draftSlots[slotId] ?? { status: 'empty' as const } })) : []);
    const end = entries.reduce((last, entry, index) => entry.step < state.currentPhase || entry.slot.status !== 'empty' ? index + 1 : last, 0);
    state[`${team}${action === 'ban' ? 'Bans' : 'Picks'}`] = entries.slice(0, end).map(({ slot }) => slot.status === 'selected' ? slot.heroId! : null);
  }
  state.draftComplete = state.currentPhase === draftPhases(state).length
    && Object.values(state.draftSlots).every(slot => slot.status !== 'empty');
}
function validateDraft(state: MatchState, requireComplete = false) {
  const rules = state.currentGameRules ?? legacyGameRules(state);
  validateGameRules(rules);
  ensureSlots(state);
  const selected: Array<{ team: 'blue' | 'red'; action: 'ban' | 'pick'; id: number }> = [];
  for (const phase of draftPhases(state)) for (const slotId of phase.slots) {
    const slot = state.draftSlots[slotId];
    if (!slot || !['empty', 'skipped', 'selected'].includes(slot.status)) throw new Error('Invalid draft slot');
    if (slot.status === 'empty') { if (requireComplete) throw new Error(`尚未填写：${slotId}`); continue; }
    if (slot.status === 'skipped') { if (phase.action !== 'ban') throw new Error('Pick cannot be skipped'); continue; }
    if (!heroes.some(hero => hero.id === slot.heroId)) throw new Error('找不到该英雄');
    if (rules.heroPool && !rules.heroPool.includes(slot.heroId!)) throw new Error('该英雄不在本局可用英雄池');
    const reason = draftRestriction(state, phase.team, phase.action, slot.heroId!);
    if (reason) throw new Error(reason);
    selected.push({ team: phase.team, action: phase.action, id: slot.heroId! });
  }
  for (const item of selected) {
    const others = selected.filter(other => other.id === item.id);
    if (others.length > 1 && (!rules.allowDuplicates || others.some(other => other.action === 'ban'))) throw new Error('该英雄已被选择或禁用');
  }
  validateLineup(state, requireComplete);
}
function recordView(state: MatchState, record: GameDraftRecord): MatchState {
  const view: MatchState = { ...copy(state), ...copy(record), gameId: record.id, committedGameId: record.id,
    lineupConfirmedTeamIds: [...(record.lineupConfirmedTeamIds ?? [])],
    draftGameNumber: record.gameNumber, currentGameRules: copy(record.rules ?? legacyGameRules(state)),
    blueBans: [...(record.blueBans ?? [])], redBans: [...(record.redBans ?? [])],
    draftMode: record.rules?.draftMode ?? state.draftMode, draftRuleMode: record.rules?.draftRuleMode ?? 'normal',
    firstPickSide: record.firstPickSide, draftSlots: copy(record.draftSlots ?? {}) };
  view.currentPhase = record.currentPhase ?? draftPhases(view).length;
  ensureSlots(view);
  projectSlots(view);
  return view;
}
function updateRecord(record: GameDraftRecord, view: MatchState) {
  Object.assign(record, { draftSlots: copy(view.draftSlots), currentPhase: view.currentPhase, draftComplete: view.draftComplete, lineupConfirmedTeamIds:[...view.lineupConfirmedTeamIds], rules: copy(view.currentGameRules ?? legacyGameRules(view)),
    firstPickSide: view.firstPickSide, blueBans: [...view.blueBans], redBans: [...view.redBans],
    bluePicks: [...view.bluePicks], redPicks: [...view.redPicks],
    blueAssignments: [...view.blueAssignments], redAssignments: [...view.redAssignments] });
}
function syncCurrentRecord(state: MatchState) {
  const record = state.draftHistory.find(record => record.id === state.committedGameId);
  if (record) updateRecord(record, state);
}
function refreshConflicts(state: MatchState) {
  state.ruleConflicts = [];
  for (const record of state.draftHistory) {
    try { validateDraft(recordView(state, record)); }
    catch (error) { state.ruleConflicts.push({ gameId: record.id, reason: error instanceof Error ? error.message : 'Invalid draft' }); }
  }
  try { validateDraft(state); }
  catch (error) {
    if (!state.ruleConflicts.some(conflict => conflict.gameId === state.gameId)) state.ruleConflicts.push({ gameId: state.gameId, reason: error instanceof Error ? error.message : 'Invalid draft' });
  }
}
function validateSavedState(raw: unknown, matchId?: string): MatchState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('比赛备份格式无效');
  const input = raw as MatchState;
  const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  for (const id of [input.matchId, input.gameId, input.committedGameId]) if (id !== undefined && id !== null && !validId(id)) throw new Error('比赛备份 ID 无效');
  if (input.bpInputMode !== undefined && !['manual','screen','lcu'].includes(input.bpInputMode)) throw new Error('比赛备份输入模式无效');
  if (!['BO1','BO3','BO5','BO7'].includes(input.seriesFormat)) throw new Error('比赛备份赛制无效');
  validateScores(input.blueScore, input.redScore, input.seriesFormat);
  integer(input.gameNumber, 1, Number(input.seriesFormat.slice(2)));
  integer(input.currentPhase, 0, 20);
  if (typeof input.draftComplete !== 'boolean') throw new Error('比赛备份进度无效');
  for (const team of [input.blueTeam, input.redTeam]) {
    if (!team || typeof team !== 'object') throw new Error('比赛备份队伍无效');
    if (team.id !== undefined && !validId(team.id)) throw new Error('比赛备份队伍 ID 无效');
    shortText(team.name, 60); portraitURL(team.logo);
    if (team.players !== undefined && (!Array.isArray(team.players) || team.players.length !== 5 || team.players.some(player => typeof player !== 'string' || player.length > 40))) throw new Error('比赛备份选手无效');
    if (team.playerIds !== undefined && (!Array.isArray(team.playerIds) || team.playerIds.length !== 5 || new Set(team.playerIds).size !== 5 || team.playerIds.some(id => !validId(id)))) throw new Error('比赛备份选手 ID 无效');
    if (team.playerPortraits !== undefined) {
      if (!Array.isArray(team.playerPortraits) || team.playerPortraits.length !== 5) throw new Error('比赛备份选手图片无效');
      team.playerPortraits.forEach(portraitURL);
    }
    if (team.playerRoles !== undefined && (!Array.isArray(team.playerRoles) || team.playerRoles.length !== 5 || team.playerRoles.some(role => !['top','jungle','mid','bot','support'].includes(role)))) throw new Error('比赛备份选手位置无效');
  }
  const state = normalizeState(input, matchId);
  shortText(state.stage,120);
  const choices: Array<[unknown, readonly string[]]> = [
    [state.language,['zh','eng']], [state.overlayLayout,['panel','side']], [state.scoreDisplay ?? 'number',['number','boxes']],
    [state.draftMode,['match','normal']], [state.draftRuleMode,['normal','global','player']],
    [state.firstPickSide,['blue','red']], [state.displayLeftSide,['blue','red']], [state.sideSwapMode,['moveTeams','colorsOnly']],
    [state.artSourceMode,['auto','legacy']], [state.roleIconStyle,['minimal','ornate']], [state.roleIconBackground,['light','dark']],
  ];
  if (choices.some(([value, allowed]) => typeof value !== 'string' || !allowed.includes(value))) throw new Error('比赛备份设置无效');
  if ([state.bpPaused,state.showHeroName,state.flowbornFormsIndependent].some(value => typeof value !== 'boolean')) throw new Error('比赛备份设置无效');
  if (!Array.isArray(state.ruleConflicts) || state.ruleConflicts.some(conflict => !validId(conflict.gameId) || typeof conflict.reason !== 'string' || conflict.reason.length > 500)) throw new Error('比赛备份冲突记录无效');
  if (!Array.isArray(state.lineupConfirmedTeamIds) || new Set(state.lineupConfirmedTeamIds).size !== state.lineupConfirmedTeamIds.length
    || state.lineupConfirmedTeamIds.some(id => ![state.blueTeam.id,state.redTeam.id].includes(id))
    || (state.lineupConfirmedTeamIds.length > 0 && !state.draftComplete)) throw new Error('比赛备份阵容确认无效');
  for (const [id, override] of Object.entries(state.heroArtOverrides)) {
    if (!heroes.some(hero => String(hero.id) === id)) throw new Error('比赛备份原画英雄 ID 无效');
    if (override.useLegacyImage !== undefined && typeof override.useLegacyImage !== 'boolean') throw new Error('比赛备份原画设置无效');
    if (override.panel) validateArtCrop(override.panel);
    if (override.side) validateArtCrop(override.side);
  }
  for (const [id, override] of Object.entries(state.heroDataOverrides)) {
    if (!heroes.some(hero => String(hero.id) === id)) throw new Error('比赛备份英雄资料 ID 无效');
    for (const name of [override.chineseName,override.englishName]) if (name !== undefined) { shortText(name,60); if (!name.trim()) throw new Error('比赛备份英雄名称无效'); }
    for (const lane of [override.occupation,override.altOccupation]) if (lane !== undefined && !['','Top Lane','Jungle','Mid Lane','Bot Lane','Support'].includes(lane)) throw new Error('比赛备份英雄资料无效');
    if (override.aliases !== undefined) {
      if (!Array.isArray(override.aliases) || override.aliases.length > 20) throw new Error('比赛备份英雄别名无效');
      override.aliases.forEach(alias => shortText(alias,60));
    }
    if (override.imageLink !== undefined) portraitURL(override.imageLink);
    if (override.artLink !== undefined) portraitURL(override.artLink);
  }
  if (state.blueTeam.id === state.redTeam.id) throw new Error('比赛备份队伍 ID 重复');
  if (state.draftGameNumber !== null) integer(state.draftGameNumber,1,Number(state.seriesFormat.slice(2)));
  if (state.seriesRules) validateSeriesRules(state.seriesRules, Number(state.seriesFormat.slice(2)));
  if (state.currentGameRules) validateGameRules(state.currentGameRules);
  for (const side of ['blue','red'] as const) for (const kind of ['Bans','Picks','Assignments'] as const) {
    const ids = state[`${side}${kind}`];
    if (!Array.isArray(ids) || ids.length > 5 || (kind === 'Assignments' && ids.length !== 5)
      || ids.some(id => id !== null && !heroes.some(hero => hero.id === id))) throw new Error('比赛备份英雄 ID 无效');
  }
  ensureSlots(state);
  const allowed = draftPhases(state).flatMap(phase => phase.slots);
  if (Object.keys(state.draftSlots).some(id => !allowed.includes(id))) throw new Error('比赛备份槽位无效');
  integer(state.currentPhase, 0, draftPhases(state).length);
  for (const slot of Object.values(state.draftSlots)) {
    if (!slot || typeof slot !== 'object' || !['empty','skipped','selected'].includes(slot.status)
      || (slot.assignmentIndex !== undefined && (!Number.isInteger(slot.assignmentIndex) || slot.assignmentIndex < 0 || slot.assignmentIndex > 4))) throw new Error('比赛备份槽位无效');
  }
  projectSlots(state);
  if (state.lineupConfirmedTeamIds.length && !state.draftComplete) throw new Error('比赛备份阵容确认无效');
  try { validateDraft(state); }
  catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (!['usedByTeam','usedByPlayer','opponentAlreadyUsed'].includes(reason) || !state.bpPaused
      || !state.ruleConflicts.some(conflict => conflict.gameId === state.gameId && conflict.reason === reason)) throw error;
  }
  if (input.draftSlots && Object.keys(input.draftSlots).length) {
    for (const side of ['blue','red'] as const) for (const kind of ['Bans','Picks'] as const) {
      if (JSON.stringify(state[`${side}${kind}`]) !== JSON.stringify(input[`${side}${kind}`] ?? [])) throw new Error('比赛备份槽位与选禁数组不一致');
    }
  }
  if (!Array.isArray(state.draftHistory) || state.draftHistory.length > 7 || new Set(state.draftHistory.map(record => record.id)).size !== state.draftHistory.length) throw new Error('比赛备份历史无效');
  if (new Set(state.draftHistory.map(record => record.gameNumber)).size !== state.draftHistory.length) throw new Error('比赛备份历史局次重复');
  for (const record of state.draftHistory) {
    if (!validId(record.id)) throw new Error('比赛备份历史 ID 无效');
    if (!Number.isFinite(record.committedAt)) throw new Error('比赛备份历史时间无效');
    integer(record.gameNumber, 1, Number(state.seriesFormat.slice(2)));
    if (record.rules) validateGameRules(record.rules);
    validateSavedState({...recordView(state, record), committedGameId:null, draftHistory:[]}, state.matchId);
  }
  if (state.committedGameId && (state.committedGameId !== state.gameId || !state.draftHistory.some(record => record.id === state.committedGameId))) throw new Error('比赛备份当前归档 ID 无效');
  return state;
}
export class Store {
  data: Data;
  constructor(private file?: string, private clock = Date.now, private presets?: TeamPresetStore) {
    this.data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {
      version: 1, state: initialState(), events: [], history: [], revision: 0, ids: [],
    };
    if (this.data.version !== 1 || !Array.isArray(this.data.events) || !Array.isArray(this.data.history)) throw new Error('比赛存档无效，请恢复有效备份');
    delete (this.data as Data & {delay?: number}).delay;
    this.data.state = normalizeState(this.data.state);
    this.data.history = this.data.history.map(state => normalizeState(state, this.data.state.matchId));
    this.data.events = this.data.events.map(event => ({ ...event, resultingState: normalizeState(event.resultingState, this.data.state.matchId) }));
    if (file && existsSync(file) && this.data.state.currentPhase > 0 && !this.data.state.draftComplete) {
      this.data.state.bpPaused = true;
      this.data.revision++;
    }
    persist(file, this.data);
  }
  snapshot(role: Role): Snapshot {
    return {
      type: 'match_state_update',
      state: normalizeState(copy(this.data.state)),
      revision: this.data.revision,
      ...(role === 'control'
        ? {
          canUndo: this.data.history.length > 0,
        }
        : {}),
    };
  }
  exportBackup() { return copy(this.data); }
  restoreBackup(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('比赛备份格式无效');
    const backup = raw as Data;
    if (backup.version !== 1 || !Array.isArray(backup.history) || !Array.isArray(backup.events) || !Array.isArray(backup.ids)) throw new Error('比赛备份格式无效');
    const state = validateSavedState(backup.state);
    const history = backup.history.map(value => validateSavedState(value, state.matchId));
    const events = backup.events.map(event => {
      if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(event.id)
        || typeof event.type !== 'string' || !Number.isFinite(event.timestamp) || !Number.isInteger(event.revision)) throw new Error('比赛备份操作记录无效');
      return {...event, resultingState:validateSavedState(event.resultingState, state.matchId), previousState:event.previousState ? validateSavedState(event.previousState, state.matchId) : undefined};
    });
    if (backup.ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(id))) throw new Error('比赛备份操作编号无效');
    state.bpPaused = true;
    refreshConflicts(state);
    const id = globalThis.crypto.randomUUID();
    const revision = this.data.revision + 1;
    const next: Data = {version:1,state,history:[...history,copy(this.data.state)],events:[...events,{id,timestamp:this.clock(),type:'restore_backup',resultingState:copy(state),previousState:copy(this.data.state),revision,actor:{role:'control'}}],revision,ids:[...new Set([...this.data.ids,...backup.ids,id])].slice(-1000)};
    persist(this.file, next);
    this.data = next;
  }
  apply(id: string, revision: number, action: Action, actor?: {role: 'control' | 'captain'; teamId?: string}) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(id)) throw new Error('操作编号无效，请刷新页面后重试');
    if (this.data.ids.includes(id)) return;
    if (revision !== this.data.revision) throw new Error('比赛状态已更新，请确认当前选禁结果后重试');
    if (!action || typeof action !== 'object') throw new Error('操作无效');
    const next = copy(this.data);
    const state = next.state;
    switch (action.type) {
    case 'confirm_lineup': {
      if (!['blue','red'].includes(action.team)) throw new Error('操作无效');
      if (state.bpPaused) throw new Error('BP 已暂停，请等待导播恢复');
      if (state.committedGameId) throw new Error('gameAlreadyCommitted');
      if (!state.draftComplete) throw new Error('completeDraftFirst');
      validateLineup(state,true);
      const teamId = state[action.team === 'blue' ? 'blueTeam' : 'redTeam'].id;
      next.history.push(copy(state));
      if (!state.lineupConfirmedTeamIds.includes(teamId)) state.lineupConfirmedTeamIds.push(teamId);
      break;
    }
    case 'swap_display': {
      next.history.push(copy(state));
      state.displayLeftSide = state.displayLeftSide === 'blue' ? 'red' : 'blue';
      break;
    }
    case 'reorder_players': {
      if (!['blue','red'].includes(action.team)) throw new Error('操作无效');
      integer(action.from,0,4); integer(action.to,0,4);
      next.history.push(copy(state));
      const team = state[action.team === 'blue' ? 'blueTeam' : 'redTeam'];
      const move = <T>(values: T[]) => { const [value] = values.splice(action.from,1); values.splice(action.to,0,value); };
      move(team.players); move(team.playerIds!); move(team.playerPortraits); move(team.playerRoles);
      move(state[action.team === 'blue' ? 'blueAssignments' : 'redAssignments']);
      validateLineup(state,state.draftComplete);
      syncCurrentRecord(state);
      const record = state.draftHistory.find(record => record.id === state.committedGameId);
      if (record) record[action.team === 'blue' ? 'blueTeam' : 'redTeam'] = copy(team);
      refreshConflicts(state);
      break;
    }
    case 'advance_draft': {
      const phase = draftPhases(state)[state.currentPhase];
      ensureSlots(state);
      if (!phase || phase.slots.some(slotId => state.draftSlots[slotId].status === 'empty')) throw new Error('请先补齐当前步骤，再手动推进');
      next.history.push(copy(state));
      state.draftGameNumber ??= state.gameNumber;
      state.currentPhase++;
      projectSlots(state);
      validateDraft(state);
      syncCurrentRecord(state);
      break;
    }
    case 'pause_draft': {
      if (typeof action.paused !== 'boolean') throw new Error('Invalid pause state');
      if (!action.paused) {
        ensureSlots(state);
        for (const phase of draftPhases(state).slice(0, state.currentPhase)) {
          if (phase.slots.some(slotId => state.draftSlots[slotId].status === 'empty')) throw new Error('请先补齐已清空的槽位或回退，再恢复 BP');
        }
        validateDraft(state, state.currentPhase === draftPhases(state).length);
      }
      next.history.push(copy(state));
      state.bpPaused = action.paused;
      break;
    }
    case 'correct_slot': {
      shortText(action.reason, 500);
      if (!action.reason.trim()) throw new Error('请填写更正原因');
      const record = state.draftHistory.find(record => record.id === action.gameId);
      const isCurrent = action.gameId === state.gameId;
      if (!isCurrent && !record) throw new Error('找不到指定 gameId');
      const view = isCurrent ? state : recordView(state, record!);
      ensureSlots(view);
      const phase = draftPhases(view).find(phase => phase.slots.includes(action.slotId));
      if (!phase) throw new Error('找不到指定槽位，请调整本局规则后重试');
      if (action.heroId === 'skip' && phase.action !== 'ban') throw new Error('Pick cannot be skipped');
      if (typeof action.heroId === 'number' && !heroes.some(hero => hero.id === action.heroId)) throw new Error('找不到该英雄');
      if (action.heroId !== null && action.heroId !== 'skip' && typeof action.heroId !== 'number') throw new Error('Invalid hero');
      next.history.push(copy(state));
      const previous = view.draftSlots[action.slotId];
      const assignments = view[phase.team === 'blue' ? 'blueAssignments' : 'redAssignments'];
      let assignmentIndex = previous.assignmentIndex;
      if (phase.action === 'pick' && previous.status === 'selected') {
        const owner = assignments.findIndex(id => id === previous.heroId);
        if (owner >= 0) assignmentIndex = owner;
      }
      if (phase.action === 'pick' && assignmentIndex === undefined) assignmentIndex = draftPhases(view)
        .filter(candidate => candidate.team === phase.team && candidate.action === 'pick').flatMap(candidate => candidate.slots).indexOf(action.slotId);
      view.draftSlots[action.slotId] = action.heroId === null ? { status: 'empty', assignmentIndex }
        : action.heroId === 'skip' ? { status: 'skipped' } : { status: 'selected', heroId: action.heroId, assignmentIndex };
      if (action.heroId !== null) view.draftGameNumber ??= view.gameNumber;
      if (phase.action === 'pick' && assignmentIndex !== undefined) assignments[assignmentIndex] = typeof action.heroId === 'number' ? action.heroId : null;
      view.bpPaused = true;
      projectSlots(view);
      validateDraft(view);
      if (!isCurrent) updateRecord(record!, view);
      else syncCurrentRecord(state);
      state.bpPaused = true;
      refreshConflicts(state);
      break;
    }
    case 'rewind_draft': {
      shortText(action.reason, 500);
      if (!action.reason.trim()) throw new Error('请填写回退原因');
      const record = state.draftHistory.find(record => record.id === action.gameId);
      const isCurrent = action.gameId === state.gameId;
      if (!isCurrent && !record) throw new Error('找不到指定 gameId');
      const view = isCurrent ? state : recordView(state, record!);
      const stages = draftPhases(view);
      integer(action.step, 0, stages.length - 1);
      next.history.push(copy(state));
      ensureSlots(view);
      const removed: number[] = [];
      for (const phase of stages.slice(action.step)) for (const slotId of phase.slots) {
        const slot = view.draftSlots[slotId];
        if (phase.action === 'pick' && slot.status === 'selected') removed.push(slot.heroId!);
        view.draftSlots[slotId] = {status: 'empty'};
      }
      for (const side of ['blue', 'red'] as const) view[`${side}Assignments`] = view[`${side}Assignments`].map(id => id !== null && removed.includes(id) ? null : id);
      view.currentPhase = action.step;
      view.bpPaused = true;
      projectSlots(view);
      validateDraft(view);
      if (!isCurrent) updateRecord(record!, view);
      else syncCurrentRecord(state);
      state.bpPaused = true;
      refreshConflicts(state);
      break;
    }
    case 'current_rules': {
      validateGameRules(action.rules);
      if ((state.currentPhase > 0 || state.committedGameId) && !state.bpPaused) throw new Error('请先暂停 BP 再调整本局规则');
      next.history.push(copy(state));
      ensureSlots(state);
      const old = draftPhases(state);
      const saved = (team: string, kind: string) => old.filter(phase => phase.team === team && phase.action === kind).flatMap(phase => phase.slots.map(id => state.draftSlots[id]));
      const groups = {blueban: saved('blue','ban'), redban: saved('red','ban'), bluepick: saved('blue','pick'), redpick: saved('red','pick')};
      state.currentGameRules = copy(action.rules);
      state.draftMode = action.rules.draftMode;
      state.draftRuleMode = action.rules.draftRuleMode;
      state.firstPickSide = action.rules.firstPickSide;
      state.sideSwapMode = action.rules.sideSwapMode;
      const offsets = {blueban:0,redban:0,bluepick:0,redpick:0};
      const slots: Record<string, DraftSlot> = {};
      for (const phase of draftPhases(state)) for (const id of phase.slots) slots[id] = groups[`${phase.team}${phase.action}`][offsets[`${phase.team}${phase.action}`]++] ?? {status:'empty'};
      for (const key of Object.keys(groups) as Array<keyof typeof groups>) {
        if (groups[key].slice(offsets[key]).some(slot => slot.status !== 'empty')) throw new Error('新规则会删除已确认结果，请先清空冲突槽位');
      }
      state.draftSlots = slots;
      state.currentPhase = draftPhases(state).findIndex(phase => phase.slots.some(id => slots[id].status === 'empty'));
      if (state.currentPhase < 0) state.currentPhase = draftPhases(state).length;
      projectSlots(state);
      validateDraft(state);
      syncCurrentRecord(state);
      refreshConflicts(state);
      break;
    }
    case 'history_assignments': {
      shortText(action.reason, 500);
      if (!action.reason.trim()) throw new Error('请填写更正原因');
      const record = state.draftHistory.find(record => record.id === action.gameId);
      const isCurrent = action.gameId === state.gameId;
      if (!isCurrent && !record) throw new Error('找不到指定 gameId');
      const view = isCurrent ? state : recordView(state, record!);
      for (const lineup of [action.blue, action.red]) if (!Array.isArray(lineup) || lineup.length !== 5 || lineup.some(id => !Number.isInteger(id))) throw new Error('lineupInvalid');
      next.history.push(copy(state));
      view.blueAssignments = [...action.blue]; view.redAssignments = [...action.red];
      validateLineup(view, true);
      if (!isCurrent) updateRecord(record!, view); else syncCurrentRecord(state);
      state.bpPaused = true;
      refreshConflicts(state);
      break;
    }
    case 'clear_series_rules': {
      if (state.currentPhase > 0 || state.committedGameId || state.draftHistory.length) throw new Error('rulesLocked');
      next.history.push(copy(state));
      delete state.seriesRules;
      delete state.currentGameRules;
      break;
    }
    case 'series_rules': {
      validateSeriesRules(action.rules, Number(state.seriesFormat.slice(2)));
      const proposed = { ...state, seriesRules: action.rules };
      for (let game = 1; game <= Number(state.seriesFormat.slice(2)); game++) {
        if (gameRulesLocked(state, game) && !sameGameRules(gameRulesFor(state, game), gameRulesFor(proposed, game)))
          throw new Error('已开始或完成的对局规则不可修改 / Started game rules are locked');
      }
      next.history.push(copy(state));
      state.seriesRules = copy(action.rules);
      if (!gameRulesLocked(state, currentGame(state))) applyGameRules(state);
      break;
    }
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
      state[action.side === 'blue' ? 'blueTeam' : 'redTeam'] = { id: preset.id, name: preset.name, logo: preset.logo, players: [...preset.players], playerIds: [...(preset.playerIds ?? preset.players.map((_, index) => `${preset.id}-p${index + 1}`))], playerRoles: [...preset.playerRoles], playerPortraits: [...preset.playerPortraits] };
      break;
    }
    case 'draft_action':
    case 'draft_group':
    case 'skip_ban': {
      if (state.bpPaused) throw new Error('BP 已暂停，请等待导播恢复');
      if (state.committedGameId) throw new Error('gameAlreadyCommitted');
      if (state.draftRuleMode === 'player') {
        const players = [...state.blueTeam.players, ...state.redTeam.players].map(playerIdentity);
        if (players.some(player => !player)) throw new Error('playerMissing');
        if (new Set(players).size !== players.length) throw new Error('duplicatePlayerIds');
      }
      if (state.currentPhase === 0 && (seriesFinished(state) || state.draftHistory.some(game => game.gameNumber >= state.gameNumber))) throw new Error('updateScoreBeforeNext');
      if (state.currentPhase === 0 && !state.currentGameRules) applyGameRules(state);
      ensureSlots(state);
      const phase = draftPhases(state)[state.currentPhase];
      const actionKind = action.type === 'skip_ban' ? 'ban' : action.action;
      if (!phase || phase.team !== action.team || phase.action !== actionKind) throw new Error('当前选禁阶段不支持此操作，请确认轮次和队伍');
      const ids = action.type === 'draft_group' ? action.heroIds : action.type === 'draft_action' ? [action.heroId] : phase.slots.map(() => null);
      if (!Array.isArray(ids) || ids.length !== phase.count) throw new Error('请一次确认本步骤的全部英雄');
      if (phase.slots.some(slotId => state.draftSlots[slotId]?.status !== 'empty')) throw new Error('本步骤已经确认，请由导播处理');
      next.history.push(copy(state));
      state.draftGameNumber ??= state.gameNumber;
      const assignmentStart = draftPhases(state).slice(0, state.currentPhase).filter(previous => previous.team === phase.team && previous.action === 'pick').reduce((count, previous) => count + previous.count, 0);
      phase.slots.forEach((slotId, index) => {
        state.draftSlots[slotId] = ids[index] === null ? {status: 'skipped'} : {status: 'selected', heroId: ids[index]!};
        if (phase.action === 'pick') state[phase.team === 'blue' ? 'blueAssignments' : 'redAssignments'][assignmentStart + index] = ids[index];
      });
      state.currentPhase++;
      projectSlots(state);
      validateDraft(state);
      break;
    }
    case 'commit_game': {
      if (state.committedGameId || state.draftHistory.some(game => game.gameNumber === currentGame(state))) throw new Error('gameAlreadyCommitted');
      if (!state.draftComplete || state.bluePicks.length !== 5 || state.redPicks.length !== 5) throw new Error('completeDraftFirst');
      validateDraft(state, true);
      next.history.push(copy(state));
      state.draftHistory.push({
        id: state.gameId, draftSlots: copy(state.draftSlots), lineupConfirmedTeamIds:[...state.lineupConfirmedTeamIds], rules: copy(state.currentGameRules ?? legacyGameRules(state)), firstPickSide: state.firstPickSide, gameNumber: currentGame(state), committedAt: this.clock(),
        blueTeam: copy(state.blueTeam), redTeam: copy(state.redTeam),
        blueBans: [...state.blueBans], redBans: [...state.redBans],
        bluePicks: [...state.bluePicks], redPicks: [...state.redPicks],
        blueAssignments: [...state.blueAssignments] as number[],
        redAssignments: [...state.redAssignments] as number[],
      });
      state.committedGameId = state.gameId;
      break;
    }
    case 'next_game': {
      if (!state.committedGameId) throw new Error('commitBeforeNext');
      if (seriesFinished(state)) throw new Error('seriesHasEnded');
      if (state.gameNumber !== currentGame(state) + 1) throw new Error('updateScoreBeforeNext');
      next.history.push(copy(state)); clearDraft(state, true); if (state.seriesRules) applyGameRules(state); break;
    }
    case 'swap_sides': {
      const started = state.currentPhase > 0 || !!state.committedGameId;
      if (started && !state.bpPaused) throw new Error('swapOnlyBetweenGames');
      next.history.push(copy(state));
      [state.blueTeam, state.redTeam] = [state.redTeam, state.blueTeam];
      [state.blueScore, state.redScore] = [state.redScore, state.blueScore];
      if (started) {
        [state.blueBans, state.redBans] = [state.redBans, state.blueBans];
        [state.bluePicks, state.redPicks] = [state.redPicks, state.bluePicks];
        [state.blueAssignments, state.redAssignments] = [state.redAssignments, state.blueAssignments];
        const rules = copy(state.currentGameRules ?? legacyGameRules(state));
        rules.firstPickSide = rules.firstPickSide === 'blue' ? 'red' : 'blue';
        if (rules.stages) rules.stages = rules.stages.map(stage => ({...stage, team: stage.team === 'blue' ? 'red' : 'blue'}));
        state.currentGameRules = rules;
        state.firstPickSide = rules.firstPickSide;
        syncCurrentRecord(state);
        const record = state.draftHistory.find(record => record.id === state.committedGameId);
        if (record) { record.blueTeam = copy(state.blueTeam); record.redTeam = copy(state.redTeam); }
        refreshConflicts(state);
      }
      if (state.sideSwapMode === 'colorsOnly') state.displayLeftSide = state.displayLeftSide === 'blue' ? 'red' : 'blue';
      break;
    }
    case 'swap_picks':
    case 'swap_assignments': {
      if (!state.draftComplete) throw new Error('completeDraftFirst');
      if (!['blue', 'red'].includes(action.team)) throw new Error('操作无效');
      integer(action.from, 0, 4); integer(action.to, 0, 4);
      next.history.push(copy(state));
      const assignments = state[`${action.team}Assignments`];
      [assignments[action.from], assignments[action.to]] = [assignments[action.to], assignments[action.from]];
      validateLineup(state, true);
      syncCurrentRecord(state);
      refreshConflicts(state);
      break;
    }
    case 'set_lineup_assignments': {
      if (!state.draftComplete) throw new Error('completeDraftFirst');
      for (const lineup of [action.blue, action.red]) {
        if (!Array.isArray(lineup) || lineup.length !== 5 || lineup.some(heroId => !Number.isInteger(heroId))) throw new Error('lineupInvalid');
      }
      next.history.push(copy(state));
      state.blueAssignments = [...action.blue];
      state.redAssignments = [...action.red];
      validateLineup(state, true);
      syncCurrentRecord(state);
      refreshConflicts(state);
      break;
    }
    case 'score': {
      if (!['blue', 'red'].includes(action.team) || ![1, -1].includes(action.delta)) throw new Error('操作无效');
      next.history.push(copy(state));
      state[`${action.team}Score`] += action.delta;
      validateScores(state.blueScore, state.redScore, state.seriesFormat);
      state.gameNumber = Math.min(state.blueScore + state.redScore + 1, Number(state.seriesFormat.slice(2)));
      if (state.seriesRules && state.currentPhase === 0 && !state.committedGameId) applyGameRules(state);
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
      if (state.seriesRules) applyGameRules(state);
      break;
    case 'reset_match': {
      next.history.push(copy(state));
      const reset = initialState();

      // Reset match progress, but keep tournament configuration. A director
      // should not have to rebuild the event identity/rules after clearing a match.
      reset.seriesRules = copy(state.seriesRules);
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
      if (reset.seriesRules) applyGameRules(reset);
      next.state = reset;
      break;
    }
    case 'settings': {
      const s = action.settings;
      if (
        !s ||
        !['BO1', 'BO3', 'BO5', 'BO7'].includes(s.seriesFormat) ||
        !['match', 'normal'].includes(s.draftMode) ||
        !['normal', 'player', 'global'].includes(s.draftRuleMode ?? state.draftRuleMode) ||
        !['blue', 'red'].includes(s.firstPickSide ?? state.firstPickSide) ||
        !['moveTeams', 'colorsOnly'].includes(s.sideSwapMode ?? state.sideSwapMode) ||
        !['zh', 'eng'].includes(s.language) ||
        !['panel', 'side'].includes(s.overlayLayout) ||
        !['number', 'boxes'].includes(s.scoreDisplay ?? state.scoreDisplay ?? 'number') ||
        (s.bpInputMode ?? 'manual') !== 'manual' ||
        !['minimal', 'ornate'].includes(s.roleIconStyle ?? state.roleIconStyle ?? 'minimal') ||
        !['light', 'dark'].includes(s.roleIconBackground ?? state.roleIconBackground ?? 'light') ||
        typeof (s.showHeroName ?? state.showHeroName) !== 'boolean' ||
        typeof (s.flowbornFormsIndependent ?? state.flowbornFormsIndependent) !== 'boolean' ||
        !['auto', 'legacy'].includes(s.artSourceMode ?? state.artSourceMode ?? 'auto')
      ) {
        throw new Error('比赛设置无效，请检查赛制、语言和画面布局');
      }
      integer(s.blueScore, 0, 4); integer(s.redScore, 0, 4); integer(s.gameNumber, 1, 7);
      const wins = (Number(s.seriesFormat.slice(2)) + 1) / 2;
      if (s.blueScore > wins || s.redScore > wins || (s.blueScore === wins && s.redScore === wins) || s.gameNumber > Number(s.seriesFormat.slice(2))) throw new Error('比分或局数不符合当前赛制');
      shortText(s.stage, 80);
      if (state.seriesRules) {
        validateSeriesRules(state.seriesRules, Number(s.seriesFormat.slice(2)));
        if (s.draftMode !== state.draftMode || s.draftRuleMode !== state.draftRuleMode
          || s.firstPickSide !== state.firstPickSide || s.sideSwapMode !== state.sideSwapMode)
          throw new Error('请在逐局规则管理中修改 BP 规则 / Use Game Rules Manager');
      }
      const rulesChanged = s.draftMode !== state.draftMode || s.draftRuleMode !== state.draftRuleMode || s.firstPickSide !== state.firstPickSide || s.sideSwapMode !== state.sideSwapMode;
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
        if (team.playerIds !== undefined) {
          if (!Array.isArray(team.playerIds) || team.playerIds.length !== 5 || new Set(team.playerIds).size !== 5) throw new Error('Invalid player IDs');
          team.playerIds.forEach(id => { if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid player ID'); });
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
      const ids = [...(s.blueTeam.playerIds ?? state.blueTeam.playerIds ?? []), ...(s.redTeam.playerIds ?? state.redTeam.playerIds ?? [])];
      if (new Set(ids).size !== ids.length) throw new Error('duplicatePlayerIds');
      if (state.currentPhase > 0 && s.draftMode !== state.draftMode) throw new Error('请先重置选禁，再修改选禁赛制');
      next.history.push(copy(state));
      Object.assign(state, {
        blueTeam: {
          id: state.blueTeam.id,
          name: s.blueTeam.name,
          logo: s.blueTeam.logo,
          players: [...s.blueTeam.players],
          playerIds: [...(s.blueTeam.playerIds ?? state.blueTeam.playerIds ?? Array.from({length:5}, (_, index) => `${state.blueTeam.id}-p${index + 1}`))],
          playerRoles: [...s.blueTeam.playerRoles],
          playerPortraits: [...(s.blueTeam.playerPortraits ?? state.blueTeam.playerPortraits)],
        },
        redTeam: {
          id: state.redTeam.id,
          name: s.redTeam.name,
          logo: s.redTeam.logo,
          players: [...s.redTeam.players],
          playerIds: [...(s.redTeam.playerIds ?? state.redTeam.playerIds ?? Array.from({length:5}, (_, index) => `${state.redTeam.id}-p${index + 1}`))],
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
        bpInputMode: 'manual',
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
      if (state.seriesRules && state.currentPhase === 0 && !state.committedGameId) applyGameRules(state);
      if (state.currentPhase === 0 && !state.committedGameId) {
        if (!state.seriesRules && rulesChanged) state.currentGameRules = legacyGameRules(state);
        state.draftSlots = slotsFromLegacy(state);
      }
      // Live roster corrections must respect the incoming player’s previous picks.
      // Committed records remain immutable snapshots of the game already played.
      if (state.currentPhase > 0 && !state.committedGameId) {
        if (state.draftRuleMode === 'player') {
          const players = [...state.blueTeam.players, ...state.redTeam.players].map(playerIdentity);
          if (players.some(player => !player)) throw new Error('playerMissing');
          if (new Set(players).size !== players.length) throw new Error('duplicatePlayerIds');
        }
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
    default: throw new Error('不支持此操作');
    }
    if (!['confirm_lineup','swap_display','score','pause_draft','commit_game','hero_art_override','reset_hero_art_override','hero_data_override','reset_hero_data_override'].includes(action.type)) {
      next.state.lineupConfirmedTeamIds = [];
      const currentRecord = next.state.draftHistory.find(record => record.id === next.state.committedGameId);
      if (currentRecord) currentRecord.lineupConfirmedTeamIds = [];
      if ('gameId' in action) {
        const record = next.state.draftHistory.find(record => record.id === action.gameId);
        if (record) record.lineupConfirmedTeamIds = [];
      }
    }
    next.state = normalizeState(next.state);
    next.revision++;
    next.events.push({ id, timestamp: Math.max(this.clock(), next.events.at(-1)?.timestamp ?? 0), type: action.type, resultingState: copy(next.state), previousState: copy(this.data.state), revision: next.revision, ...(actor ? {actor} : {}), ...('reason' in action ? {reason: action.reason} : {}) });
    next.ids = [...next.ids.slice(-999), id];
    // Commit durable state before acknowledging or broadcasting. Failure leaves memory unchanged.
    persist(this.file, next);
    this.data = next;
  }
}

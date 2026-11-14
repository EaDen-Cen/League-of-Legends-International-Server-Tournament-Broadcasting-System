export type Side = 'blue' | 'red';

export type Language = 'zh' | 'eng';

export type OverlayLayout = 'panel' | 'side';
export type RoleIconStyle = 'minimal' | 'ornate';
export type RoleIconBackground = 'light' | 'dark';
export type HeroArtLayout = OverlayLayout;
export interface HeroArtCrop { x: number; y: number; scale: number }
export interface HeroArtOverride {
  useLegacyImage?: boolean;
  panel?: HeroArtCrop;
  side?: HeroArtCrop;
}
export interface HeroDataOverride {
  englishName?: string;
  chineseName?: string;
  occupation?: string;
  altOccupation?: string;
  aliases?: string[];
  /** Optional per-match/local tournament portrait source. HTTPS or absolute local path. */
  imageLink?: string;
  /** Optional per-match/local tournament splash source. HTTPS or absolute local path. */
  artLink?: string;
}
export type DraftRuleMode = 'normal' | 'player' | 'global';
export interface DraftStage { team: Side; action: 'ban' | 'pick'; count: 1 | 2 }
export interface DraftSlot { status: 'empty' | 'skipped' | 'selected'; heroId?: number; assignmentIndex?: number }
export interface DraftPhase extends DraftStage { stepId: string; slots: string[] }
export interface GameRules {
  draftMode: 'match' | 'normal';
  draftRuleMode: DraftRuleMode;
  firstPickSide: Side;
  sideSwapMode: SideSwapMode;
  enforcePreviousHistory: boolean;
  contributeToFutureHistory: boolean;
  stages?: DraftStage[];
  heroPool?: number[];
  allowDuplicates?: boolean;
}
export interface SeriesRules {
  defaultGameRules: GameRules;
  games: Record<string, Partial<GameRules>>;
}

export type SideSwapMode = 'moveTeams' | 'colorsOnly';

export type PlayerRole =
  | 'top'
  | 'jungle'
  | 'mid'
  | 'bot'
  | 'support';

export interface Team {
  id: string;
  name: string;
  logo: string;
  players: string[];
  playerIds?: string[];
  playerRoles: PlayerRole[];
  playerPortraits: string[];
}

export interface ReservePlayer {
  id: string;
  name: string;
  role: PlayerRole;
  portrait: string;
}

export interface TeamPreset extends Team {
  substitutes: ReservePlayer[];
  createdAt: number;
  updatedAt: number;
}

export interface GameDraftRecord {
  lineupConfirmedTeamIds?: string[];
  draftSlots?: Record<string, DraftSlot>;
  currentPhase?: number;
  draftComplete?: boolean;
  rules?: GameRules;
  firstPickSide: Side;
  id: string;
  gameNumber: number;
  committedAt: number;
  blueTeam: Team;
  redTeam: Team;
  /** Immutable draft-order history. */
  blueBans?: Array<number | null>;
  redBans?: Array<number | null>;
  bluePicks: Array<number | null>;
  redPicks: Array<number | null>;
  /** Final hero ownership by player slot after help-picks / swaps. */
  blueAssignments: Array<number | null>;
  redAssignments: Array<number | null>;
}

export interface MatchState {
  matchId: string;
  gameId: string;
  bpPaused: boolean;
  draftSlots: Record<string, DraftSlot>;
  ruleConflicts: Array<{ gameId: string; reason: string }>;
  lineupConfirmedTeamIds: string[];
  blueTeam: Team;
  redTeam: Team;

  blueScore: number;
  redScore: number;

  gameNumber: number;
  seriesFormat: 'BO1' | 'BO3' | 'BO5' | 'BO7';
  seriesRules?: SeriesRules;
  currentGameRules?: GameRules;
  stage: string;

  language: Language;
  overlayLayout: OverlayLayout;
  scoreDisplay?: 'number' | 'boxes';
  /** Legacy screen/lcu values are read only during migration; every current state uses manual. */
  bpInputMode?: 'manual' | 'lcu' | 'screen';
  roleIconStyle: RoleIconStyle;
  roleIconBackground: RoleIconBackground;
  showHeroName: boolean;
  artSourceMode: 'auto' | 'legacy';
  heroArtOverrides: Record<string, HeroArtOverride>;
  heroDataOverrides: Record<string, HeroDataOverride>;

  draftMode: 'match' | 'normal';
  displayLeftSide: Side;
  firstPickSide: Side;
  sideSwapMode: SideSwapMode;
  draftRuleMode: DraftRuleMode;
  /** Deprecated HOK wire field; ignored for LoL champion identity. */
  flowbornFormsIndependent: boolean;
  draftHistory: GameDraftRecord[];
  draftGameNumber: number | null;
  committedGameId: string | null;
  currentPhase: number;
  draftComplete: boolean;

  /** Ban slots preserve empty bans as null so phase order/history stay exact. */
  blueBans: Array<number | null>;
  redBans: Array<number | null>;
  /** Pick order is immutable draft history; assignments drive player cards. */
  bluePicks: Array<number | null>;
  redPicks: Array<number | null>;
  blueAssignments: Array<number | null>;
  redAssignments: Array<number | null>;
}

export type MatchSettings = Pick<
  MatchState,
  | 'blueTeam'
  | 'redTeam'
  | 'blueScore'
  | 'redScore'
  | 'gameNumber'
  | 'seriesFormat'
  | 'stage'
  | 'draftMode'
  | 'draftRuleMode'
  | 'flowbornFormsIndependent'
  | 'firstPickSide'
  | 'sideSwapMode'
  | 'language'
  | 'overlayLayout'
  | 'scoreDisplay'
  | 'bpInputMode'
  | 'roleIconStyle'
  | 'roleIconBackground'
  | 'showHeroName'
  | 'artSourceMode'
>;

export type Action =
  | { type: 'draft_group'; team: Side; action: 'ban' | 'pick'; heroIds: number[] }
  | { type: 'pause_draft'; paused: boolean }
  | { type: 'confirm_lineup'; team: Side }
  | { type: 'advance_draft' }
  | { type: 'swap_display' }
  | { type: 'reorder_players'; team: Side; from: number; to: number }
  | { type: 'correct_slot'; gameId: string; slotId: string; heroId: number | null | 'skip'; reason: string }
  | { type: 'rewind_draft'; gameId: string; step: number; reason: string }
  | { type: 'current_rules'; rules: GameRules }
  | { type: 'history_assignments'; gameId: string; blue: number[]; red: number[]; reason: string }
  | { type: 'clear_series_rules' }
  | { type: 'series_rules'; rules: SeriesRules }
  | { type: 'load_team_preset'; side: Side; presetId: string }
  | { type: 'draft_action'; team: Side; action: 'ban' | 'pick'; heroId: number }
  | { type: 'skip_ban'; team: Side }
  | { type: 'undo' | 'reset_draft' | 'reset_match' }
  | { type: 'commit_game' | 'next_game' | 'swap_sides' }
  | { type: 'score'; team: Side; delta: 1 | -1 }
  | { type: 'swap_picks'; team: Side; from: number; to: number } // legacy alias: swaps assignments, never pick order
  | { type: 'swap_assignments'; team: Side; from: number; to: number }
  | { type: 'set_lineup_assignments'; blue: number[]; red: number[] }
  | { type: 'settings'; settings: MatchSettings }
  | { type: 'hero_art_override'; heroId: number; override: HeroArtOverride }
  | { type: 'reset_hero_art_override'; heroId: number; layout?: HeroArtLayout }
  | { type: 'hero_data_override'; heroId: number; override: HeroDataOverride }
  | { type: 'reset_hero_data_override'; heroId: number }
  ;

export type Role = 'control' | 'captain' | 'overlay';

export interface Snapshot {
  type: 'match_state_update';
  state: MatchState;
  revision: number;
  canUndo?: boolean;
}

export const initialState = (): MatchState => ({
  matchId: globalThis.crypto.randomUUID(),
  gameId: globalThis.crypto.randomUUID(),
  bpPaused: false,
  draftSlots: {},
  ruleConflicts: [],
  lineupConfirmedTeamIds: [],
  blueTeam: {
    id: 'team-a',
    name: '蓝方队伍',
    logo: '',
    players: ['', '', '', '', ''],
    playerIds: ['team-a-p1', 'team-a-p2', 'team-a-p3', 'team-a-p4', 'team-a-p5'],
    playerRoles: ['top', 'jungle', 'mid', 'bot', 'support'],
    playerPortraits: ['', '', '', '', ''],
  },

  redTeam: {
    id: 'team-b',
    name: '红方队伍',
    logo: '',
    players: ['', '', '', '', ''],
    playerIds: ['team-b-p1', 'team-b-p2', 'team-b-p3', 'team-b-p4', 'team-b-p5'],
    playerRoles: ['top', 'jungle', 'mid', 'bot', 'support'],
    playerPortraits: ['', '', '', '', ''],
  },

  blueScore: 0,
  redScore: 0,

  gameNumber: 1,
  seriesFormat: 'BO3',
  stage: '社区赛事',

  language: 'zh',
  overlayLayout: 'panel',
  scoreDisplay: 'number',
  bpInputMode: 'manual',
  roleIconStyle: 'minimal',
  roleIconBackground: 'light',
  showHeroName: true,
  artSourceMode: 'auto',
  heroArtOverrides: {},
  heroDataOverrides: {},

  draftMode: 'match',
  displayLeftSide: 'blue',
  firstPickSide: 'blue',
  sideSwapMode: 'moveTeams',
  draftRuleMode: 'normal',
  flowbornFormsIndependent: true,
  draftHistory: [],
  draftGameNumber: null,
  committedGameId: null,
  currentPhase: 0,
  draftComplete: false,

  blueBans: [],
  redBans: [],
  bluePicks: [],
  redPicks: [],
  blueAssignments: [null, null, null, null, null],
  redAssignments: [null, null, null, null, null],
});

export function phases(mode: MatchState['draftMode'], firstPickSide: Side = 'blue') {
  const sequence =
    mode === 'match'
      ? 'bb rb bb rb bb rb bp rp rp bp bp rp rb bb rb bb rp bp bp rp'
      : 'bb bb rb rb bp rp rp bp bp rp rp bp bp rp';

  return sequence.split(' ').map(s => ({
    team: ((s[0] === 'b') === (firstPickSide === 'blue') ? 'blue' : 'red') as Side,
    action: (s[1] === 'b' ? 'ban' : 'pick') as 'ban' | 'pick',
  }));
}

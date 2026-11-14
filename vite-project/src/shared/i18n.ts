import type { Language } from './types';

const messages = {
  heroSort: {zh:'排序方式',eng:'Sort by'},
  heroSortChinese: {zh:'中文名称',eng:'Chinese name'},
  heroSortEnglish: {zh:'英文名称',eng:'English name'},
  heroSortLane: {zh:'分路（上路→打野→中路→下路→辅助）',eng:'Lane (Top → Jungle → Mid → Bot → Support)'},
  heroImageSettings: {zh:'Champion Studio · 英雄资料与素材',eng:'Champion Studio'},
  heroDataSettings: {zh:'赛事英雄资料',eng:'Champion profile'},
  heroEnglishName: {zh:'英文名',eng:'English name'},
  heroChineseName: {zh:'中文名',eng:'Chinese name'},
  heroPrimaryLane: {zh:'主分路',eng:'Primary lane'},
  heroSecondaryLane: {zh:'副分路',eng:'Secondary lane'},
  heroAliases: {zh:'搜索别名',eng:'Search aliases'},
  heroAliasesHint: {zh:'使用逗号分隔，可用于搜索。',eng:'Comma-separated aliases used by search.'},
  championAdvancedData: {zh:'高级资料与素材',eng:'Advanced data & assets'},
  championPortraitUrl: {zh:'Portrait / 英雄头像来源',eng:'Champion portrait'},
  championPortraitUrlHint: {zh:'用于选择器、Ban、历史记录显示。支持 HTTPS 或站内绝对路径。',eng:'Used by picker, bans and history. Accepts HTTPS or an absolute local path.'},
  championSplashUrl: {zh:'Splash Art / 转播主图来源',eng:'Splash art / broadcast source'},
  championSplashUrlHint: {zh:'用于转播 Champion Card 与裁切预览。支持 HTTPS 或站内绝对路径。',eng:'Used by broadcast cards and crop previews. Accepts HTTPS or an absolute local path.'},
  noSecondaryLane: {zh:'无',eng:'None'},
  saveHeroData: {zh:'保存英雄数据',eng:'Save hero data'},
  resetHeroData: {zh:'重置英雄数据',eng:'Reset hero data'},
  heroDataOverrideInvalid: {zh:'英雄数据设置无效，请检查名称、分路和别名。',eng:'Invalid hero data settings. Check names, lanes, and aliases.'},
  closeHeroImageSettings: {zh:'关闭 Champion Studio',eng:'Close Champion Studio'},
  heroImageSource: {zh:'英雄主图来源',eng:'Hero art source'},
  heroImageAuto: {zh:'赛事 Splash Art 优先',eng:'Prefer broadcast splash art'},
  heroImageLegacy: {zh:'本地头像回退',eng:'Local portrait fallback'},
  showHeroName: {zh:'显示英雄名称',eng:'Show hero name'},
  showHeroNameHint: {zh:'关闭后直播卡片仅显示选手名称。',eng:'When off, broadcast cards show only player names.'},
  championSearch: {zh:'搜索英雄',eng:'Search champions'},
  championSearchHint: {zh:'名称、英文名、称号、拼音首字母…',eng:'Name, title, alias, initials…'},
  championSearchResults: {zh:'英雄搜索结果',eng:'Champion search results'},
  championResultCount: {zh:'显示 {shown} / {total}',eng:'Showing {shown} / {total}'},
  championLoadMore: {zh:'再显示 48 个',eng:'Show 48 more'},
  championShowAll: {zh:'显示全部',eng:'Show all'},
  championProfile: {zh:'CHAMPION PROFILE',eng:'CHAMPION PROFILE'},
  dataOverrideActive: {zh:'资料已覆盖',eng:'Data override active'},
  artOverrideActive: {zh:'素材已覆盖',eng:'Artwork override active'},
  baseChampionData: {zh:'Data Dragon 基础资料',eng:'Base Data Dragon data'},
  baseChampionArt: {zh:'默认赛事素材',eng:'Default broadcast artwork'},
  sourceDataDragon: {zh:'Riot Data Dragon',eng:'Riot Data Dragon'},
  chooseHeroToEdit: {zh:'完整英雄列表',eng:'Full champion list'},
  useLegacyForHero: {zh:'此英雄强制使用本地头像',eng:'Force local portrait for this champion'},
  cropPanel: {zh:'底部横排裁切',eng:'Bottom panel crop'},
  cropSide: {zh:'左右竖排裁切',eng:'Side crop'},
  cropX: {zh:'横向焦点',eng:'Horizontal focus'},
  cropY: {zh:'纵向焦点',eng:'Vertical focus'},
  cropScale: {zh:'缩放',eng:'Zoom'},
  artReference: {zh:'完整图片参考',eng:'Full-art reference'},
  artReferenceHint: {zh:'两个白框分别表示底部横排和左右竖排的参考取景范围；下方预览为真实 CSS 裁切。',eng:'The two white frames represent the bottom-panel and side-layout reference crops. Live previews below use the actual CSS crop.'},
  livePreview: {zh:'实时预览',eng:'Live preview'},
  saveHeroArt: {zh:'保存英雄图片调整',eng:'Save artwork adjustment'},
  resetCrop: {zh:'重置当前布局',eng:'Reset current layout'},
  resetHeroArt: {zh:'重置此英雄全部调整',eng:'Reset all hero adjustments'},
  fullArtUnavailable: {zh:'此英雄没有高清封面，将自动使用旧版图片。',eng:'No full artwork is available; the legacy image will be used.'},
  heroArtCropInvalid: {zh:'英雄图片裁切参数无效，请重新调整。',eng:'Invalid hero artwork crop. Adjust the crop and try again.'},
  heroArtOverrideInvalid: {zh:'英雄图片设置无效，请重新调整。',eng:'Invalid hero artwork settings. Adjust them and try again.'},
  lineupInvalid: {zh:'最终阵容归属无效：每队 5 个已选英雄必须各分配给一名选手。',eng:'Invalid final lineup: each of the five picked heroes must be assigned to exactly one player.'},
  lineupIncomplete: {zh:'请先确认双方最终英雄归属，再提交本局。',eng:'Confirm both teams’ final hero ownership before committing the game.'},
  scoreDisplay: {zh:'比分显示',eng:'Score display'},
  scoreNumber: {zh:'数字比分',eng:'Numbers'},
  scoreBoxes: {zh:'赛事格子',eng:'Win boxes'},
  bpInputMode: {zh:'BP 输入模式',eng:'BP input mode'},
  manualInput: {zh:'手动选择',eng:'Manual selection'},
  roleIconStyle: {zh:'分路图标样式',eng:'Role icon style'},
  roleIconMinimal: {zh:'简约',eng:'Minimal'},
  roleIconOrnate: {zh:'华丽',eng:'Ornate'},
  roleIconBackground: {zh:'分路图标底色',eng:'Role icon background'},
  roleIconLight: {zh:'银底',eng:'Silver'},
  roleIconDark: {zh:'黑底',eng:'Dark / black'},
  rosterSource: {zh:'选手资料来源',eng:'Roster source'},
  substitutes: {zh:"替补名单",eng:"Substitutes"},
  addSubstitute: {zh:"添加替补",eng:"Add substitute"},
  removeSubstitute: {zh:"移除替补",eng:"Remove substitute"},
  substituteName: {zh:"替补选手 ID",eng:"Substitute player ID"},
  substitutesInvalid: {zh:"替补资料无效：最多 20 人，请检查重复 ID、分路和图片地址",eng:"Invalid substitutes: up to 20 players; check duplicate IDs, roles and image URLs."},
  quickSubstitution: {zh:"快速换人",eng:"Quick substitution"},
  chooseRosterPlayer: {zh:"选择已保存选手",eng:"Choose saved player"},
  targetSlot: {zh:"替换位置",eng:"Replace slot"},
  applySubstitute: {zh:"填入选手资料",eng:"Fill player details"},
  substituteHint: {zh:"选择选手和位置后填入，再保存比赛设置同步。可选择首发换回；不会改动资料库。",eng:"Choose a player and slot, fill their details, then save match settings to sync. Saved starters can be restored. The library stays unchanged."},
  substituteNeedsTeam: {zh:"选择本队的已保存资料，即可调用首发及替补；不会更换比赛队伍身份",eng:"Choose your saved team to recall starters and substitutes without changing match team identity."},
  starter: {zh:"首发",eng:"Starter"},
  reserve: {zh:"替补",eng:"Substitute"},
  substituteFilled: {zh:"已填入选手资料，请保存比赛设置",eng:"Player details filled. Save match settings to sync."},
  libraryPortraitUploadHint: {zh:'PNG / JPEG / WebP，最大 5 MB。上传后保存队伍资料即可保留。',eng:'PNG / JPEG / WebP, up to 5 MB. Save the team to keep the uploaded portrait.'},
  teamLibrary: {zh:"队伍资料库",eng:"Team library"},
  chooseTeam: {zh:"选择已保存队伍",eng:"Choose saved team"},
  loadTeam: {zh:"载入比赛",eng:"Load into match"},
  saveNewTeam: {zh:"另存为新队伍",eng:"Save as new team"},
  updateSavedTeam: {zh:"更新已保存队伍",eng:"Update saved team"},
  manageTeams: {zh:"管理队伍资料",eng:"Manage saved teams"},
  newTeam: {zh:"新建队伍",eng:"New team"},
  deleteTeam: {zh:"删除队伍资料",eng:"Delete saved team"},
  saveTeam: {zh:"保存队伍资料",eng:"Save team"},
  searchTeams: {zh:"搜索队伍",eng:"Search teams"},
  presetSaved: {zh:"队伍资料已保存",eng:"Team saved"},
  presetDeleted: {zh:"队伍资料已删除，当前比赛不受影响",eng:"Team deleted. The current match is unchanged."},
  presetLocked: {zh:"系列赛开始后不能载入其他队伍。仍可修改当前选手资料。",eng:"Teams cannot be loaded during an active series. Current roster details remain editable."},
  presetDuplicate: {zh:"双方不能载入同一支队伍",eng:"The same team cannot play both sides."},
  presetMissing: {zh:"找不到该队伍，请刷新资料库",eng:"Team not found. Refresh the library."},
  presetInvalid: {zh:"队伍资料无效，请检查队名、5 名选手、分路及图片地址",eng:"Invalid team details. Check the name, five players, roles, and image URLs."},
  presetSaveFailed: {zh:"队伍资料保存失败，请检查连接或服务器存储",eng:"Unable to save team details. Check the connection or server storage."},
  presetCopyHint: {zh:"载入后独立编辑；保存比赛设置不会覆盖资料库。",eng:"Loaded teams are independent copies. Saving match settings does not update the library."},
  confirmDeleteTeam: {zh:"删除此队伍资料？当前比赛和历史记录将保留。",eng:"Delete this saved team? Current match and history will be preserved."},
  confirmUpdateTeam: {zh:"将当前资料覆盖到已保存队伍？",eng:"Replace the saved team with these details?"},
  confirmLoadTeam: {zh:"载入队伍将替换当前阵容，未保存的比赛设置将丢失。继续？",eng:"Loading a team replaces the roster and discards unsaved match settings. Continue?"},
  refreshTeams: {zh:"刷新资料库",eng:"Refresh library"},
  noTeams: {zh:"尚无队伍资料",eng:"No saved teams"},
  closeLibrary: {zh:"关闭队伍资料库",eng:"Close team library"},
  choosePortrait: { zh: '选择图片', eng: 'Choose image' },
  clearPortrait: { zh: '清空图片', eng: 'Clear image' },
  portraitPreview: { zh: '选手照片预览', eng: 'Player portrait preview' },
  portraitEmpty: { zh: '未设置选手照片，将使用队徽或编号', eng: 'No portrait set. The team logo or slot number will be used.' },
  portraitLoading: { zh: '正在加载照片…', eng: 'Loading portrait…' },
  portraitLoaded: { zh: '照片加载成功', eng: 'Portrait loaded' },
  portraitFailed: { zh: '照片加载失败，请检查链接或重新上传', eng: 'Portrait failed to load. Check the URL or upload again.' },
  portraitUploadHint: { zh: 'PNG / JPEG / WebP，最大 5 MB。上传后保存设置即可同步。选中英雄后主图显示英雄。', eng: 'PNG / JPEG / WebP, up to 5 MB. Save settings after uploading to sync. After a pick, the main image shows the hero.' },
  uploading: { zh: '正在上传…', eng: 'Uploading…' },
  uploadTooLarge: { zh: '图片超过 5 MB，请选择更小的文件', eng: 'Image exceeds 5 MB. Choose a smaller file.' },
  uploadFormat: { zh: '请选择有效的 PNG、JPEG 或 WebP 图片', eng: 'Choose a valid PNG, JPEG or WebP image.' },
  uploadUnauthorized: { zh: '仅导播控制端可以上传图片，请检查访问口令', eng: 'Only Control can upload images. Check your access token.' },
  uploadFailed: { zh: '图片上传失败，请重试', eng: 'Image upload failed. Please try again.' },
  emptyBan: { zh:'空 Ban', eng:'Empty ban' },
  emptyBanButton: { zh:'空 Ban / 跳过本次禁用', eng:'Empty ban / Skip this ban' },
  emptyBanManualHint: { zh:'只推进当前 Ban 阶段，不会占用任何英雄。可撤销。', eng:'Advances only the current Ban phase without consuming a hero. Undo remains available.' },
  emptyBanRecorded: { zh:'已记录：{side} 空 Ban', eng:'Recorded: {side} empty ban' },
  emptyBanSuspected: { zh:'疑似空 Ban · 稳定检测 {count}/3', eng:'Possible empty ban · stable detection {count}/3' },
  emptyBanConfirm: { zh:'确认空 Ban', eng:'Confirm empty ban' },
  emptyBanOnlyDuringBan: { zh:'只有当前阶段为 Ban 时才能记录空 Ban。', eng:'An empty ban can only be recorded during a Ban phase.' },
  quickInputHint: { zh: '/ 或 Ctrl+K 搜索 · 中文模式支持拼音声母（如 lplp）· Enter 录入当前第一个可用结果 · Esc 清空', eng: '/ or Ctrl+K to search · Enter submits the first available filtered result · Esc clears' },
  recordAccepted: { zh: '已记录：{side} {action} · {hero}', eng: 'Recorded: {side} {action} · {hero}' },
  pickAction: { zh: '选择', eng: 'PICK' },
  banAction: { zh: '禁用', eng: 'BAN' },
  banCount: { zh: '禁用 {number}/{total}', eng: 'BAN {number}/{total}' },
  noMatchingHeroes: { zh: '没有匹配的英雄，请清空搜索或调整分路筛选', eng: 'No matching heroes. Clear the search or change the lane filter.' },

  opponentAlreadyUsed: { zh: '对手在此前有效局已选过此英雄，无需禁用', eng: 'The opponent already used this hero in a committed game. No ban needed.' },
  portrait: { zh: '选手形象地址', eng: 'Player portrait URL' },
  portraitHint: { zh: 'HTTPS 图片链接或 /playerImg/ 本地路径；留空使用队徽。', eng: 'HTTPS image URL or /playerImg/ local path. Leave blank to use the team logo.' },
  portraitInvalid: { zh: '选手形象须为 HTTPS 图片链接或单斜线开头的本地路径', eng: 'Use an HTTPS portrait URL or a local path starting with one slash.' },
  portraitsInvalid: { zh: '每支队伍必须设置 5 个选手形象位置', eng: 'Each team must have 5 portrait slots.' },
  firstPickSide: { zh: 'BP 先手方', eng: 'Draft starting side' },
  firstPickLocked: { zh: '选禁开始后先手方锁定，请重置选禁或进入下一局后修改', eng: 'The starting side locks once drafting begins. Reset the draft or start the next game to change it.' },
  sideSwapMode: { zh: '换边方式', eng: 'Side swap behavior' },
  moveTeams: { zh: '交换队伍显示位置', eng: 'Move teams between screen sides' },
  colorsOnly: { zh: '队伍位置不变，仅交换蓝红方', eng: 'Keep screen positions, swap colors' },
  confirmColorsSwap: { zh: '两队显示位置保持不变，交换蓝红方归属？比分、选手和历史仍跟随原队伍，先手方不变。', eng: 'Keep team screen positions and swap blue/red sides? Scores, players and history follow each team. The starting side stays unchanged.' },
  screenLeft: { zh: '画面左侧', eng: 'Screen left' },
  screenRight: { zh: '画面右侧', eng: 'Screen right' },

  backendUpgrade: { zh: '当前连接的是旧版服务。请停止旧进程并重新启动服务器，V2 操作将在连接新版服务后启用。', eng: 'Connected to an older server. Stop it and restart the server to enable V2 controls.' },
  draftRules: { zh: 'BP 规则', eng: 'BP rules' },
  ruleNormal: { zh: '普通 BP', eng: 'NORMAL BP' },
  rulePlayer: { zh: '选手 BP', eng: 'PLAYER BP' },
  ruleGlobal: { zh: '队内全局 BP（自定义）', eng: 'Team Fearless (custom)' },
  historyTitle: { zh: '有效局历史', eng: 'COMMITTED GAMES' },
  noHistory: { zh: '尚无已确认的有效局', eng: 'No committed games yet' },
  historyNormal: { zh: '仅供回顾，不限制下一局英雄。', eng: 'For reference only. Previous picks remain available.' },
  historyPlayer: { zh: '按选手 ID 限制重复英雄，队友可使用；换人时请填写新选手自己的 ID。', eng: 'Restrictions follow player IDs. Teammates may reuse heroes. Enter each substitute’s own ID.' },
  historyGlobal: { zh: '同一队伍已使用的英雄不可再次选择；换边、换人不清空历史。', eng: 'A team cannot reuse its committed picks. History follows teams across side swaps and substitutions.' },
  commitGame: { zh: '确认本局有效', eng: 'Commit game' },
  nextGame: { zh: '开始下一局', eng: 'Start next game' },
  swapSides: { zh: '交换蓝红方', eng: 'Swap sides' },
  confirmCommit: { zh: '确认本局比赛有效、英雄归属正确？提交后将计入跨局历史；比分请单独更新。', eng: 'Confirm this game is valid and player assignments are correct? Its picks will enter history. Update the score separately.' },
  confirmNext: { zh: '确认进入下一局？当前选禁画面将清空，已提交历史保留。', eng: 'Start the next game? Clear the current draft and retain committed history.' },
  confirmSwap: { zh: '交换两队、选手和比分的蓝红位置？历史将继续跟随原队伍。', eng: 'Swap teams, players and scores between blue and red? History will follow each team.' },
  gameCommitted: { zh: '本局已提交', eng: 'Game committed' },
  lifecycleHint: { zh: '比赛结束后确认本局有效 → 更新比分 → 开始下一局。原 BP 重开无需重复提交；无效 BP 在提交前重置。', eng: 'After play: commit the valid game → update score → start the next game. Replays with the same draft need no second commit; reset invalid drafts before committing.' },
  assignmentTitle: { zh: '英雄归属校对', eng: 'Review player assignments' },
  assignmentHint: { zh: '每个位置对应选手 ID。选择另一位英雄会交换两名选手的英雄，服务器会重新检查资格。', eng: 'Each slot belongs to its player ID. Choosing another hero swaps assignments; the server rechecks eligibility.' },
  pickingFor: { zh: '当前为 {player} 选择英雄（第 {slot} 位）', eng: 'Picking for {player} (slot {slot})' },
  playerMissing: { zh: '请先填写该位置的选手 ID', eng: 'Enter this slot’s player ID first.' },
  usedByPlayer: { zh: '该选手在此前有效局已使用此英雄', eng: 'This player used this hero in a committed game.' },
  usedByTeam: { zh: '该队伍在此前有效局已使用此英雄', eng: 'This team used this hero in a committed game.' },
  gameAlreadyCommitted: { zh: '本局已提交，不能重复提交或修改英雄归属', eng: 'This game is committed. It cannot be committed again or reassigned.' },
  completeDraftFirst: { zh: '请先完成本局选禁', eng: 'Complete the current draft first.' },
  commitBeforeNext: { zh: '请先确认本局有效', eng: 'Commit the current game first.' },
  updateScoreBeforeNext: { zh: '请核对系列赛比分，再进入对应的下一局', eng: 'Check the series score before starting the corresponding next game.' },
  seriesHasEnded: { zh: '系列赛已结束，请重置整场比赛开始新系列赛', eng: 'The series has ended. Reset the match to start a new series.' },
  swapOnlyBetweenGames: { zh: '仅可在两局之间、选禁开始前交换蓝红方', eng: 'Swap sides between games, before the draft starts.' },
  committedDraftReset: { zh: '本局已提交，请使用“开始下一局”；若提交有误，可撤销至提交前', eng: 'This draft is committed. Start the next game, or undo to before the commit if it was invalid.' },
  rulesLocked: { zh: '选禁开始后规则锁定；存在有效局历史时需重置整场比赛才能修改规则或赛制', eng: 'Rules lock when drafting starts. Reset the match to change rules or series format after a committed game.' },
  duplicatePlayerIds: { zh: '选手 BP 要求每位选手 ID 唯一', eng: 'Player BP requires a unique ID for every player.' },
  rosterLocked: { zh: '选禁开始后选手及分路锁定，请在下一局开始前修改', eng: 'Players and roles lock during the draft. Change them before the next draft.' },
  scoreImmediate: { zh: '比分直接同步；其他设置需保存。', eng: 'Score changes sync immediately. Save other settings separately.' },
  "appName": {
    "zh": "英雄联盟赛事转播系统",
    "eng": "LoL Broadcast System"
  },
  "gameTitle": {
    "zh": "英雄联盟",
    "eng": "LEAGUE OF LEGENDS"
  },
  "brandTitle": {
    "zh": "英雄联盟",
    "eng": "LoL"
  },
  "brandSubtitle": {
    "zh": "赛事转播",
    "eng": "Broadcast"
  },
  "communitySystem": {
    "zh": "社区赛事转播系统",
    "eng": "Community Broadcast System"
  },
  "controlEyebrow": {
    "zh": "社区赛事 · 导播控制台",
    "eng": "COMMUNITY ESPORTS · PRODUCTION"
  },
  "controlLogin": {
    "zh": "赛事控制台登录",
    "eng": "Control access"
  },
  "accessToken": {
    "zh": "访问口令",
    "eng": "Access token"
  },
  "connect": {
    "zh": "连接",
    "eng": "Connect"
  },
  "logout": {
    "zh": "退出登录",
    "eng": "Sign out"
  },
  "controlRealtime": {
    "zh": "控制台 · 实时状态",
    "eng": "CONTROL · REALTIME"
  },
  "disconnectedNotice": {
    "zh": "连接未就绪，操作已禁用。现有画面保留，正在恢复服务器状态。",
    "eng": "Connection unavailable. Controls are disabled while the current picture is held and server state reloads."
  },
  "connectingServer": {
    "zh": "正在连接比赛服务器…",
    "eng": "Connecting to match server…"
  },
  "serverFooter": {
    "zh": "比赛数据由服务器统一同步",
    "eng": "Match data synchronized by the server"
  },
  "rosterUpdated": {
    "zh": "英雄资料更新于 {date}",
    "eng": "Hero roster updated {date}"
  },
  "ban": {
    "zh": "禁用",
    "eng": "BAN"
  },
  "emptyPick": {
    "zh": "待选",
    "eng": "PICK"
  },
  "draftComplete": {
    "zh": "选禁完成",
    "eng": "DRAFT COMPLETE"
  },
  "banHero": {
    "zh": "{team}禁用英雄",
    "eng": "{team} BANNING"
  },
  "pickHero": {
    "zh": "{team}选择英雄",
    "eng": "{team} PICKING"
  },
  "phaseStep": {
    "zh": "第 {step} 步，共 {total} 步",
    "eng": "STEP {step} OF {total}"
  },
  "gameNumber": {
    "zh": "第 {number} 局",
    "eng": "GAME {number}"
  },
  "playerNumber": {
    "zh": "选手 {number}",
    "eng": "Player {number}"
  },
  "blueSide": {
    "zh": "蓝方",
    "eng": "Blue"
  },
  "redSide": {
    "zh": "红方",
    "eng": "Red"
  },
  "blueTeam": {
    "zh": "蓝方队伍",
    "eng": "TEAM BLUE"
  },
  "redTeam": {
    "zh": "红方队伍",
    "eng": "TEAM RED"
  },
  "blueAnalysis": {
    "zh": "蓝方阵容分析",
    "eng": "Blue draft analysis"
  },
  "redAnalysis": {
    "zh": "红方阵容分析",
    "eng": "Red draft analysis"
  },
  "opponent": {
    "zh": "对手：{team}",
    "eng": "Opponent: {team}"
  },
  "synergy": {
    "zh": "搭配推荐",
    "eng": "Synergy / Combo"
  },
  "ourCounters": {
    "zh": "我方克制",
    "eng": "Our picks counter"
  },
  "counteredBy": {
    "zh": "我方被克制",
    "eng": "Threats to our picks"
  },
  "enemyCounters": {
    "zh": "克制对手的推荐",
    "eng": "Counters to enemy picks"
  },
  "noRelationships": {
    "zh": "暂无关系数据",
    "eng": "No relationship data"
  },
  "matchSettings": {
    "zh": "比赛设置",
    "eng": "Match settings"
  },
  "teamSettings": {
    "zh": "队伍设置",
    "eng": "Team settings"
  },
  "closeTeamSettings": {
    "zh": "关闭队伍设置",
    "eng": "Close team settings"
  },
  "hideSettings": {
    "zh": "收起比赛设置",
    "eng": "Hide match settings"
  },
  "teamName": {
    "zh": "队伍名称",
    "eng": "Team name"
  },
  "logoAddress": {
    "zh": "队徽图片地址",
    "eng": "Team logo URL"
  },
  "logoPlaceholder": {
    "zh": "填写图片链接或本地资源路径",
    "eng": "Enter an image URL or local asset path"
  },
  "players": {
    "zh": "选手名单",
    "eng": "Players"
  },
  "lane": {
    "zh": "分路",
    "eng": "Lane"
  },
  "top": {
    "zh": "上路",
    "eng": "Top Lane"
  },
  "jungle": {
    "zh": "打野",
    "eng": "Jungle"
  },
  "mid": {
    "zh": "中路",
    "eng": "Mid Lane"
  },
  "bot": {
    "zh": "下路",
    "eng": "Bot Lane"
  },
  "support": {
    "zh": "辅助",
    "eng": "Support"
  },
  "all": {
    "zh": "全部",
    "eng": "All"
  },
  "seriesScore": {
    "zh": "系列赛比分",
    "eng": "Series score"
  },
  "decreaseScore": {
    "zh": "减少系列赛比分",
    "eng": "Decrease series score"
  },
  "increaseScore": {
    "zh": "增加系列赛比分",
    "eng": "Increase series score"
  },
  "matchDisplay": {
    "zh": "赛制与显示",
    "eng": "Match and display"
  },
  "stage": {
    "zh": "比赛阶段",
    "eng": "Match stage"
  },
  "seriesFormat": {
    "zh": "系列赛赛制",
    "eng": "Series format"
  },
  "bo1": {
    "zh": "一局定胜负",
    "eng": "Best of 1"
  },
  "bo3": {
    "zh": "三局两胜",
    "eng": "Best of 3"
  },
  "bo7": { "zh": "七局四胜", "eng": "Best of 7" },
  "bo5": {
    "zh": "五局三胜",
    "eng": "Best of 5"
  },
  "currentGame": {
    "zh": "当前局",
    "eng": "Current game"
  },
  "automatic": {
    "zh": "自动计算",
    "eng": "Calculated automatically"
  },
  "draftMode": {
    "zh": "BP 形式",
    "eng": "BP format"
  },
  "matchMode": {
    "zh": "赛事模式 · 每队禁用 5 位",
    "eng": "Tournament Draft · 5 bans per team"
  },
  "normalMode": {
    "zh": "自定义简化模式 · 每队禁用 2 位",
    "eng": "Custom simplified · 2 bans per team"
  },
  "language": {
    "zh": "界面语言",
    "eng": "Interface language"
  },
  "chinese": {
    "zh": "中文",
    "eng": "Chinese"
  },
  "english": {
    "zh": "英文",
    "eng": "English"
  },
  "languageHint": {
    "zh": "保存后，界面与英雄名称将一起切换。",
    "eng": "Save to switch the entire interface and hero names."
  },
  "overlayLayout": {
    "zh": "直播布局",
    "eng": "Overlay layout"
  },
  "panelLayout": {
    "zh": "底部横排",
    "eng": "Bottom panel"
  },
  "sideLayout": {
    "zh": "左右竖排",
    "eng": "Side columns"
  },
  "saveSettings": {
    "zh": "保存设置",
    "eng": "Save settings"
  },
  "undo": {
    "zh": "撤销上次操作",
    "eng": "Undo last action"
  },
  "resetDraft": {
    "zh": "重置选禁",
    "eng": "Reset draft"
  },
  "resetMatch": {
    "zh": "重置整场比赛",
    "eng": "Reset match"
  },
  "confirmResetDraft": {
    "zh": "确定清空当前选禁？队伍设置和比分将保留。",
    "eng": "Reset this draft? Team settings and scores will be kept."
  },
  "confirmResetMatch": {
    "zh": "确定重置整场比赛？队伍、比分、选禁和历史会清空；赛事名称/阶段、赛制、比分显示和 BP 规则会保留。",
    "eng": "Reset the entire match? Teams, scores and draft will be cleared."
  },
  "selectHero": {
    "zh": "点击一位英雄确认",
    "eng": "Select one hero to confirm"
  },
  "searchHeroes": {
    "zh": "搜索英雄",
    "eng": "Search heroes"
  },
  "availabilityHint": {
    "zh": "英雄可用范围以本场赛事版本及游戏房间为准。",
    "eng": "Champion eligibility follows the tournament patch and game lobby."
  },
  "statusConnecting": {
    "zh": "正在连接",
    "eng": "Connecting"
  },
  "statusConnected": {
    "zh": "已连接",
    "eng": "Connected"
  },
  "statusReconnecting": {
    "zh": "正在重连",
    "eng": "Reconnecting"
  },
  "statusTokenRequired": {
    "zh": "请输入访问口令",
    "eng": "Access token required"
  },
  "statusInvalidToken": {
    "zh": "访问口令无效",
    "eng": "Invalid token"
  },
  "statusRejected": {
    "zh": "无访问权限",
    "eng": "Access rejected"
  },
  "statusUnavailable": {
    "zh": "连接未就绪",
    "eng": "Connection unavailable"
  },
  "stageCommunity": {
    "zh": "社区赛事",
    "eng": "COMMUNITY TOURNAMENT"
  },
  "stageGroup": {
    "zh": "小组赛",
    "eng": "Group Stage"
  },
  "stageQuarter": {
    "zh": "四分之一决赛",
    "eng": "Quarterfinal"
  },
  "stageSemi": {
    "zh": "半决赛",
    "eng": "Semifinal"
  },
  "stageFinal": {
    "zh": "决赛",
    "eng": "Final"
  },
  "stageGrandFinal": {
    "zh": "总决赛",
    "eng": "Grand Final"
  }
} as const;

export type MessageKey = keyof typeof messages;
export function translate(lang: Language, key: MessageKey, params: Record<string, string | number> = {}) {
  return messages[key][lang].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
export const translator = (lang: Language) => (key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params);

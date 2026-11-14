# League of Legends Tournament Broadcast System

面向社区赛事的 **英雄联盟 人工 BP / 队长终端 / 导播 / OBS 图形系统**。项目使用 React + TypeScript + Node.js + WebSocket，当前 LoL 版本拥有独立的英雄数据、赛事规则、视觉语言和运行目录，不再把 HOK 的 UI 或英雄数据当作生产依赖。

## HOK 工作流适配升级

新增 **BO7、逐局规则管理、P1–P5 开播核对、OBS 图片预解码揭幕**。逐局规则支持系列默认与单局覆盖，冻结已开始局，保存当局历史快照，并分别控制 Fearless 历史的执行与累积；保留 LoL 的英雄数据与只读 LCU 连接。操作和本轮范围见 [逐局规则与开播核对](docs/guides/game-rules-manager.md)。

## 当前能力

- **Control**：比赛设置、BP、比分、换边、最终阵容归属、队伍资料库、替补、Champion Studio、队长授权与锁定后纠错。
- **Captain**：仅本队当前步骤预选与人工确认；导播可随时撤权和接管。
- **OBS Overlay**：固定 1920×1080 透明画布，支持 Panel / Side 两种布局。
- **赛事状态**：BO1 / BO3 / BO5 / BO7、Stage、Game、Series Score、Undo、Draft History。
- **LoL BP**：默认每方 5 Ban + 5 Pick，支持蓝 / 红先手与跨局自定义规则。
- **远程访问**：内置 Windows 启动脚本，可配合 Cloudflare Quick Tunnel。

## LoL 版本的独立设计

本仓库不是“把王者荣耀名字替换成英雄联盟”的皮肤层。

### 1. 独立视觉系统

Overlay 与 Control 使用 LoL 专属的深墨蓝 / 黑色底、金色赛事线框、蓝红阵营强调和中央 Draft 状态。英雄选择卡使用 Splash Art，Ban、历史记录和搜索列表使用本地 Portrait。

### 2. 独立 Champion 数据链路

当前基线为 **Riot Data Dragon 16.19.1，共 173 位 Champion**。

`vite-project/scripts/lol-sync.mjs` 负责：
- 使用 Riot champion key 作为稳定 ID；
- 同步英文名和简体中文英雄名；
- 把英文 / 中文称号作为搜索 alias；
- 下载本地小头像到 `public/champions/`；
- 为转播卡生成 Data Dragon Splash Art URL；
- 重新生成 `src/data/lolHeroes.ts`。

### 3. Champion Studio

Control 中的 **Champion Studio** 把原来的“英雄图片设置”升级为赛事资料管理工具：

- 名称 / alias / 拼音首字母搜索；
- 英文名、中文名、主分路、副分路、搜索 alias 覆盖；
- Panel / Side 两套独立焦点与缩放；
- 完整 Splash Art 参考和实时裁切预览；
- 单 Champion 可替换 Portrait / Splash Art 来源（HTTPS 或站内路径）；
- 单英雄强制使用本地 Portrait fallback；
- 明确显示 Data Override / Artwork Override 状态。

运行时 override 保存在比赛状态中，不会修改生成的 Data Dragon 基线。

## 快速启动

```powershell
cd vite-project
npm ci
npm run build
npm run server
```

本地开发入口：

- Control: `http://127.0.0.1:3001/control#token=local-control`
- Captain：从导播面板生成每队专属链接；没有通用队长口令。
- OBS: `http://127.0.0.1:3001/overlay/draft#token=local-overlay`

公网环境必须设置两个不同的强口令。参考 `vite-project/.env.example`。

Windows 一键启动与 Cloudflare：见 [Windows 启动指南](docs/guides/windows-launcher.md)。

## 数据目录

LoL 运行数据与其他游戏隔离：

```text
vite-project/data/lol/match.json
vite-project/data/lol/match.json.access.json       # 队长授权；不得用旧副本回滚
vite-project/data/lol/match.json.telemetry.json    # 独立遥测与人工修正
vite-project/data/lol/team-presets.json
vite-project/data/lol/uploads/player-portraits/
```

不要导入 HOK 比赛存档。不同游戏可能使用重叠的数字 ID，但语义完全不同。

## Champion 数据更新

在 `vite-project/`：

```powershell
npm run hero:sync -- 16.19.1
npm test
npm run build
npm run lint
```

更新到新 Data Dragon 版本时，把 `16.19.1` 替换为目标版本。同步脚本会在写入前验证每个新 Champion 都有初始分路映射，避免未知英雄静默进入生产数据。

详细说明见 [LoL Champion Data Pipeline](docs/research/hero-sync.md)。

## 人工 BP 与游戏采集

正式 BP 只能来自导播或本队已授权队长。LCU 只提供本机连接诊断，不再写入 BP；游戏机桥接程序读取 Live Client 结构化数据并上传到独立遥测存储。游戏未运行时，人工 BP 和人工数据补录仍可使用。采集不会修改比分、归档、切局或正式英雄。

队长链接按真实 teamId 绑定，换边后继续跟随本队。重新生成或撤销链接后，旧网页与连接失去写权限；导播接管/纠错后需明确重新授权。OBS 仅使用独立只读口令。

规则、纠错、权限、存档与恢复见 [人工 BP 操作指南](docs/guides/manual-bp.md)；游戏采集的支持字段、桥接命令和限制见 [游戏数据桥接](docs/guides/game-data-bridge.md)。

## 验证

```powershell
cd vite-project
npm test
npm run build
npm run lint
npm run test:e2e
```

GitHub Actions 使用 `.github/workflows/lol-checks.yml` 进行 LoL 专用检查。

## 文档

- [文档索引](docs/README.md)
- [快速开始](docs/guides/getting-started.md)
- [导播操作指南](docs/guides/operator-guide.md)
- [Windows / Cloudflare](docs/guides/windows-launcher.md)
- [人工 BP、授权与纠错](docs/guides/manual-bp.md)
- [游戏数据采集桥接](docs/guides/game-data-bridge.md)
- [系统架构与坐标模型](docs/design/architecture.md)
- [Champion Data Pipeline](docs/research/hero-sync.md)
- [项目里程碑](MILESTONES.md)

旧 HOK 研究、同步器和交接资料只保存在 `docs/archive/`，用于追溯历史，不属于 LoL 当前运行方式。

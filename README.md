# League of Legends Tournament Broadcast System

面向社区赛事的 **英雄联盟 BP / 导播 / 解说同步 / OBS 图形系统**。项目使用 React + TypeScript + Node.js + WebSocket，当前 LoL 版本拥有独立的英雄数据、赛事规则、视觉语言和运行目录，不再把 HOK 的 UI 或英雄数据当作生产依赖。

## 当前能力

- **Control**：比赛设置、BP、比分、换边、最终阵容归属、队伍资料库、替补、Champion Studio、League Client 自动 BP。
- **Caster**：只读延迟状态，适合异地解说。
- **OBS Overlay**：固定 1920×1080 透明画布，支持 Panel / Side 两种布局。
- **赛事状态**：BO1 / BO3 / BO5、Stage、Game、Series Score、Undo、Draft History。
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
- Caster: `http://127.0.0.1:3001/caster#token=local-caster`
- OBS: `http://127.0.0.1:3001/overlay/draft#token=local-overlay`

公网环境必须设置三个不同的强口令。参考 `vite-project/.env.example`。

Windows 一键启动与 Cloudflare：见 [Windows 启动指南](docs/guides/windows-launcher.md)。

## 数据目录

LoL 运行数据与其他游戏隔离：

```text
vite-project/data/lol/match.json
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

## League Client Auto BP

比赛设置现在提供：

- **Manual Selection**：手动录入；
- **League Client 房间 API 自动同步**：推荐。

当 League Client 与 Broadcast Server 在同一台电脑运行时，Server 会本地读取 `/lol-champ-select/v1/session`，只同步已经 `completed` 的 Ban / Pick。Champion ID 直接进入现有 authoritative Store，因此 Overlay、Caster、Undo、历史和 BP 规则仍使用同一套状态逻辑。

自动同步不会覆盖不一致的比赛状态：如果 LCU 已完成的 BP 前缀和程序当前记录不同，会停止并提示导播核对；Hero Picker 始终保留作为手动 fallback。

LCU 连接凭证只留在 Server 进程中，不发送到浏览器。普通 Windows 安装会自动发现 League Client；特殊安装可参考 `.env.example` 设置 lockfile / port / token。

详细说明见 [League Client 房间 API 自动 BP](docs/guides/lcu-auto-bp.md)。

旧 Screen Recognition 代码暂时保留作兼容/维护 fallback，但已退出正常 Match Settings 流程。

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
- [League Client 自动 BP](docs/guides/lcu-auto-bp.md)
- [Legacy Screen Recognition](docs/guides/screen-recognition.md)
- [系统架构与坐标模型](docs/design/architecture.md)
- [Champion Data Pipeline](docs/research/hero-sync.md)
- [项目里程碑](MILESTONES.md)

旧 HOK 研究、同步器和交接资料只保存在 `docs/archive/`，用于追溯历史，不属于 LoL 当前运行方式。

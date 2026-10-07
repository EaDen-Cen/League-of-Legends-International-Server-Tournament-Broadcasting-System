# 快速开始

[返回文档索引](../README.md)

## 1. 安装

需要 Node.js 与 npm。

```powershell
cd vite-project
npm ci
npm run build
```

## 2. 启动

```powershell
npm run server
```

默认端口为 `3001`。

本地开发入口：

- Control：`http://127.0.0.1:3001/control#token=local-control`
- Caster：`http://127.0.0.1:3001/caster#token=local-caster`
- OBS：`http://127.0.0.1:3001/overlay/draft#token=local-overlay`

开发默认 token 只适用于本机。公网部署使用 `.env` 中三个互不相同的强 token。

## 3. 第一次比赛

建议按以下顺序：

1. 打开 Control。
2. Match Settings 设置 BO、Stage、先手方、换边方式、语言、Overlay Layout。
3. Team Settings 载入或创建双方队伍。
4. 在 Hero Picker 完成 5 Ban + 5 Pick。
5. 如果比赛中发生 help-pick / swap，在 Lineup Assignments 确认最终 5 人英雄归属。
6. Commit Game。
7. 更新比分、换边或进入 Next Game。
8. OBS Browser Source 使用 `/overlay/draft`。

## 4. Champion Studio

Control 工具栏打开 **Champion Studio**：

- 搜索 Champion；
- 检查中文 / 英文名称与 alias；
- 调整主 / 副分路；
- 分别设置 Panel 与 Side 的 Splash Art 焦点和缩放；
- 必要时单英雄切换到本地 Portrait fallback。

这些设置是比赛运行时 override，不会改写 `lolHeroes.ts`。

## 5. 更新英雄库

```powershell
npm run hero:sync -- 16.19.1
npm test
npm run build
npm run lint
```

要更新版本时显式传入新的 Data Dragon 版本号。不要重新启用旧 HOK Hero Sync 工具。

## 6. BP 自动输入

推荐在 Match Settings 中使用 **League Client 房间 API 自动同步**。League Client 与 Broadcast Server 在同一台电脑时通常不需要额外配置。

进入 Champ Select 后，Control 会显示 League Client / Champ Select / 阵营映射 / 最近同步状态。只有锁定完成的 Ban / Pick 才会进入比赛状态；Hover 不会提交。

详见 [League Client 自动 BP](lcu-auto-bp.md)。

旧 Screen Recognition 已退出正常设置入口，仅作为兼容实现保留。

## 7. 浏览器缩放与画面尺寸

Control / Caster 可以正常使用浏览器缩放。Screen Recognition 的 Browser Window Capture 不使用网页像素保存校准框，因此缩放 Control 页面不会移动 ROI。

需要区分两件事：

- **网页缩放 / Control 窗口大小变化**：无需重新校准。
- **League Client 捕获画面宽高比变化**：系统会提示检查识别框。

OBS Overlay 是固定 1920×1080 设计画布。OBS Browser Source 请直接设置 1920×1080，不要靠浏览器 Zoom 调整布局。

## 8. 运行数据

默认：

```text
data/lol/match.json
data/lol/team-presets.json
data/lol/uploads/player-portraits/
```

LoL 与 HOK 存档不可互换。

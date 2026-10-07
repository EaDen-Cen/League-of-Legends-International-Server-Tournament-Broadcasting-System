# LoL 导播操作指南

[返回文档索引](../README.md)

## Control 工作区

Control 是唯一可写端。Caster 与 Overlay 只读取服务端 authoritative state。

桌面布局分为：
- 左侧：比赛监视、比分、生命周期、队伍与阵容状态；
- 右侧：当前 Draft Phase、搜索、分路过滤、Champion Grid。

快捷键：
- `/`：聚焦英雄搜索；
- `Ctrl+K` / `Cmd+K`：聚焦搜索；
- `Esc`：清空搜索；
- 输入能唯一命中可用英雄时，`Enter` 提交当前 Ban / Pick。

## 标准 LoL BP

Match 模式使用每方 5 Ban + 5 Pick 的两阶段 BP。界面始终由服务端 currentPhase 决定当前阵营和 Ban / Pick 类型。

如果比赛客户端出现空 Ban，使用 **Empty Ban / Skip Ban**，不要拿占位 Champion 代替。

## 比赛生命周期

一局正常流程：

```text
Draft
→ Final Lineup Assignment
→ Commit Game
→ Score
→ Swap / Next Game
```

`bluePicks` / `redPicks` 记录原始 BP 顺序；最终选手英雄归属由 Assignments 单独维护，因此 help-pick 和赛后换位不会破坏 Draft History。

## Match Settings

可配置：
- BO1 / BO3 / BO5；
- Stage；
- 标准 / 自定义 Draft；
- Normal / Player / Global 跨局限制；
- Blue / Red First Pick；
- Move Teams / Colors Only；
- 中文 / English；
- Panel / Side Overlay；
- 数字 / Box Series Score；
- Manual / League Client 房间 API 自动同步；
- 分路图标：简约 / 华丽；华丽模式使用独立金色徽章/奖章框，不只是缩放普通 glyph；
- 分路图标底色：银底 / 黑底；银底使用压暗金属灰，避免纯白在 OBS 里过曝；
- 是否在卡片显示 Champion Name；
- Splash Art 优先 / 本地 Portrait fallback。

## Team Settings / Team Library

每支队伍可保存 Stable Team ID、Team Name / Logo、5 名首发、Top / Jungle / Mid / Bot / Support、Player Portrait 和 substitutes。

载入资料库后，当前比赛拿到独立副本。临时换人不会自动覆盖长期 Team Preset。

## Champion Studio

Champion Studio 是 LoL 版本的 Champion 数据和视觉素材入口。

### 搜索

支持中文名、英文名、Data Dragon title alias、自定义 alias 和中文拼音首字母。

### 赛事资料 Override

可以覆盖 Chinese Name、English Name、Primary Lane、Secondary Lane、Search Aliases。这些值会立即影响搜索、显示和当前比赛，不改写生成基线。

### Artwork Override

默认使用 Data Dragon Splash Art。每位 Champion 可直接替换 Portrait / Splash Art 来源，也可单独调整 Panel 与 Side 的 X / Y / Scale，或强制 Local Portrait fallback。

素材来源只接受 HTTPS 或站内绝对路径；未修改的字段不会被写成粘性 override，因此后续 Data Dragon 更新仍会跟随新基线。

右侧参考区显示完整原图和两个布局的实际取景范围。

## 操作手感与网页缩放

Control 的工作区会监听组件尺寸、浏览器窗口和 `visualViewport` 变化。浏览器 Zoom 或窗口宽度改变后，左侧 Monitor 与右侧 Hero Picker 的 sticky 偏移会重新计算，而不是沿用旧高度。

Hero Picker 的推荐操作：

- `/` 或 `Ctrl/Cmd + K` 随时回到搜索；
- 提交成功后搜索框自动清空并重新获得焦点；
- Server 正在确认一条操作时所有写操作进入 pending，防止连续点击重复提交；
- 连接中断时保留当前画面，但禁止继续写入，重连后以 Server state 为准。

Champion Studio 默认先显示 48 位 Champion；可以“再显示 48 个”或“显示全部”。搜索会重新从 48 个结果开始，避免一次渲染完整英雄池造成界面过重。

## League Client 自动 BP

推荐模式是 **League Client 房间 API 自动同步**。

Server 在本机读取 League Client 的 Champ Select session，只处理已经完成的 Ban / Pick。导播在 Control 中只需要观察 LCU 状态面板：

- League Client：是否连接；
- Champ Select：是否进入选禁；
- Local side mapping：本机队伍映射到蓝 / 红哪一侧；
- Last sync：最近一次自动写入。

LCU 自动操作仍然通过 `Store.apply()`，所以所有现有规则继续生效。如果 LCU 与程序已记录 BP 的前缀不一致，自动同步会停止，不会覆盖现场数据。

Hero Picker 永远保留，可以在客户端异常时直接手动继续。

详细排错见 [League Client 自动 BP](lcu-auto-bp.md)。

## Legacy Screen Recognition

旧 Browser / Native Screen Recognition 代码仍保留作为兼容层，但不再出现在普通 Match Settings。后续如果 Riot 修改 LCU，可以临时恢复该入口。其 ROI 仍使用 source-relative normalized coordinates，并保留 zoom-safe 与 stale-result protection。

## Overlay

**Panel** 适合 BP 专用画面：顶部赛事条 + 中央透明区 + 底部双方 Champion Card。

**Side** 适合保留中央游戏 / 客户端画面：双方 Champion Card 固定在左右边缘。

LoL 主题采用深墨蓝、金色赛事线框和阵营蓝 / 红，不与 HOK 版本共享视觉主题。Panel / Side 的双方 Ban 条按中心轴严格镜像，红方的标签、Ban 槽顺序和外侧锚点与蓝方对称。Overlay 是固定 **1920×1080** 播出画布；不要用网页 Zoom 代替 OBS Browser Source 尺寸设置。

## Caster Delay

Caster 的**队伍名、队标、首发选手与分路资料实时可见**，因此即使 BP 延迟还没成熟，解说页也不会是空白。Ban/Pick、比分、有效局和比赛进度仍按服务器延迟时间线显示。

Caster 页面会明确显示当前延迟秒数；刚开始测试时，若设为 180 秒，前 180 秒看不到新的英雄选禁是预期行为而不是断线。需要即时测试时可以临时把延迟设为 0，正式比赛再恢复目标延迟。不要用 OBS 人工延迟替代状态延迟来解决 BP 信息提前泄漏。

“重置整场比赛”只清空队伍、比分、选禁与历史；赛事名称/阶段、BO 赛制、比分显示方式、BP 规则与其他赛事展示配置保留。

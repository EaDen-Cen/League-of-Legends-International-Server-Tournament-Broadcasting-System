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
- Manual / Screen Recognition；
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

## Screen Recognition 操作原则

Browser Window Capture 是首选。20 个 BP 槽保存的是源画面 0–1 比例，不是浏览器像素。

- 缩放 Control 页面：无需重做校准；
- 改变 Control 窗口大小：无需重做校准；
- 1920×1080 改到 1280×720：同宽高比，通常无需重做；
- 改成不同宽高比：系统提示检查当前槽；
- 共享中的游戏窗口动态改分辨率：预览舞台跟随 source size 更新；
- Recognition 返回时若 BP 已进入下一阶段：结果自动丢弃。

Native Windows Capture 仍使用桌面像素坐标，只作为兼容模式。

## Overlay

**Panel** 适合 BP 专用画面：顶部赛事条 + 中央透明区 + 底部双方 Champion Card。

**Side** 适合保留中央游戏 / 客户端画面：双方 Champion Card 固定在左右边缘。

LoL 主题采用深墨蓝、金色赛事线框和阵营蓝 / 红，不与 HOK 版本共享视觉主题。Overlay 是固定 **1920×1080** 播出画布；不要用网页 Zoom 代替 OBS Browser Source 尺寸设置。

## Caster Delay

Caster 可设置独立延迟。Control 与 Overlay 保持实时，Caster 按服务器时间线读取过去状态。不要用 OBS 人工延迟代替状态延迟来解决 BP 信息提前泄漏。

# League of Legends Broadcast 项目里程碑

> 本文件只描述 LoL 版本的当前产品方向。HOK 阶段的历史交接和同步器资料已归档到 `docs/archive/`。

## 当前产品

LoL Broadcast 已具备完整三端结构：

```text
Control
  ├─ Tournament / Team / Draft operations
  ├─ Champion Studio
  ├─ Manual / Screen Recognition
  └─ Final Lineup Assignment
        │
        ▼
Node.js + WebSocket authoritative state
        │
        ├────────► Caster (delayed read-only)
        └────────► OBS Overlay (realtime)
```

## L0 — LoL 数据与规则分离

**状态：✅**

- Data Dragon Champion roster；
- Riot champion key；
- Top / Jungle / Mid / Bot / Support；
- 标准 5 Ban + 5 Pick 两阶段 BP；
- 独立 `data/lol/`；
- 独立浏览器缓存前缀；
- HOK roster / Flowborn 逻辑退出 LoL 生产数据。

## L1 — LoL Operator Cockpit

**状态：✅**

- Desktop 双栏导播台；
- 快捷搜索 / Enter 提交；
- 分路过滤；
- BO / Stage / Score；
- Blue / Red First Pick；
- Side Swap；
- Team Library；
- substitutes；
- Final Lineup Assignment；
- Caster Delay。

## L2 — LoL Broadcast Graphics

**状态：✅ 第一轮独立视觉完成**

- 深墨蓝 / 黑色赛事底；
- 金色结构线；
- 蓝红阵营色；
- 中央 Draft Phase；
- Series Score；
- Ban strip；
- 5v5 Champion Card；
- Panel / Side 两种 1920×1080 布局；
- Data Dragon Splash Art；
- 本地 Portrait fallback。

目标：LoL 与 HOK 可以共享底层状态架构，但不共享赛事台视觉身份。

## L3 — Champion Studio

**状态：✅**

- 名称 / alias / 拼音首字母搜索；
- Champion Profile override；
- Primary / Secondary Lane；
- Panel / Side 独立裁切；
- 完整原图参考；
- 实时预览；
- Data / Art override 状态；
- 单英雄 Portrait fallback。

## L4 — Champion Data Pipeline

**状态：✅**

当前基线：**Data Dragon 16.19.1 / 173 Champions**。

已完成：
- 中文名使用 `zh_CN.name`；
- 中文 / 英文称号进入 alias；
- Portrait 下载本地；
- Broadcast 使用横向 Splash Art；
- 新 Champion 未配置分路时同步失败；
- 回归测试锁定 Champion name / alias / art pipeline。

## L5 — Auto BP / Recognition

**状态：🚧 可用但必须继续实机校准**

- 20 个独立 Ban / Pick 槽；
- 本地 Portrait 模板；
- Browser Capture；
- Windows 原生捕获 opt-in；
- Review Required；
- Final Lineup Sync。

下一步重点不是扩大自动化，而是使用真实 LoL 客户端分辨率完成稳定性彩排。

## L6 — Production Rehearsal

**状态：🚧 下一优先级**

需要完成至少一次完整 BO3 / BO5 模拟：

1. 两队资料载入；
2. 真实 LoL Draft；
3. Screen Recognition 与 Manual fallback；
4. Help-pick / Swap；
5. Commit Game；
6. Score / Side Swap；
7. Caster Delay；
8. OBS Panel 与 Side；
9. Cloudflare 异地 Caster；
10. 断线恢复。

## L7 — Production Reliability

**状态：📋**

候选：
- Match snapshot / backup；
- Team Library backup；
- Event audit log；
- Crash recovery；
- Match export / import；
- health dashboard；
- 固定域名 / Named Tunnel；
- 长期部署。

## 长期原则

1. Server 是比赛状态唯一权威。
2. LoL Champion 数据只从 LoL pipeline 进入生产。
3. UI 风格可以独立演进，不污染规则模型。
4. Draft Order 与最终 Player Assignment 分离。
5. 自动识别必须允许导播 Review 和 Manual fallback。
6. 自动测试之外必须做真实赛事彩排。

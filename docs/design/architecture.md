# 系统结构

[返回文档索引](../README.md)

本项目采用 **Server authoritative state + 三端只读/可写职责分离**。所有比赛状态最终以 Node.js Server 为准，Control 不直接修改 Overlay 或 Caster。

## 运行结构

```text
                       ┌───────────────┐
                       │    Control    │
                       │ 唯一可写前端   │
                       └───────┬───────┘
                               │ Action + revision
                               ▼
┌────────────────────────────────────────────────────┐
│                    Node.js Server                  │
│                                                    │
│  server/store.ts                                   │
│  - authoritative MatchState                       │
│  - revision / idempotency                         │
│  - validation / undo                              │
│  - committed history                              │
│  - delayed snapshots                              │
│  - persistence                                    │
└───────────────┬─────────────────────┬──────────────┘
                │ realtime            │ delayed
                ▼                     ▼
        ┌──────────────┐       ┌──────────────┐
        │ OBS Overlay  │       │    Caster    │
        │   read-only  │       │   read-only  │
        └──────────────┘       └──────────────┘
```

Control 提交操作时携带当前 revision。Server 校验成功、落盘后再 ACK 并广播新状态，因此客户端不能靠本地 UI 状态绕过比赛规则。

## 主要目录

| 位置 | 职责 |
| --- | --- |
| `vite-project/src/BroadcastApp.tsx` | Control / Caster / Overlay 当前入口 |
| `vite-project/src/control/` | 导播工作区、Hero Picker、LCU 状态、Legacy Screen Recognition、Champion Studio、队伍与阵容 |
| `vite-project/src/overlay/` | OBS Draft Overlay、英雄揭示 |
| `vite-project/src/shared/` | Match 类型、规则、显示、国际化、WebSocket 连接 |
| `vite-project/src/data/lolHeroes.ts` | Data Dragon 生成的 LoL Champion 基线 |
| `vite-project/server/store.ts` | 比赛状态、修订号、Undo、延迟、历史与落盘 |
| `vite-project/server/server.ts` | HTTP / WebSocket / 权限 / 静态文件 / LCU Bridge / Legacy Recognition API |
| `vite-project/server/*.test.ts` | Server、规则、识别几何单元测试 |
| `vite-project/e2e/` | 浏览器级 Control / Caster / Overlay 验收 |
| `vite-project/data/lol/` | LoL 比赛运行数据 |
| `docs/archive/` | HOK 阶段和旧实现历史资料，不参与生产逻辑 |

## League Client 输入链路

正常自动 BP 不再依赖画面坐标：

```text
LeagueClientUx.exe
       │ local HTTPS + Basic auth
       ▼
/lol-champ-select/v1/session
       │
       ▼
server/lcu.ts
       │ completed actions only
       │ turn-order / prefix validation
       ▼
Store.apply()
       │
       ├── realtime Overlay
       └── delayed Caster
```

`server/lcu.ts` 只负责读取和解释输入，不直接修改 MatchState。

它会：

- 自动发现本机 LCU port / temporary token；
- 解析 Champ Select action；
- 按 LCU action turn order 对齐项目 `phases()`，Observer 客户端无需 ally/enemy 身份也能同步；
- `isAllyAction` 或 cell membership 仅用于可选的本机阵营状态显示；
- 将 Champion ID 映射到当前 Draft Phase；
- 对比已记录 BP 前缀；
- 只把一致的下一步提交给 Store。

LCU token 不进入浏览器，也不通过 WebSocket 广播。

如果 Server 和 League Client 不在同一台机器，当前实现不会远程读取 LCU；未来应使用本机 Bridge，而不是开放 LCU 端口到公网。

## Legacy Screen Recognition 坐标体系

Screen Recognition 明确分成三个坐标空间：

```text
1. Source frame
   例如 1920×1080 的 League Client 捕获画面
        │
        │ normalized region
        ▼
2. Calibration model
   x / y / width / height 全部保存为 0–1 比例
        │
        │ render-only scaling
        ▼
3. Browser preview stage
   根据当前 Control 宽度、visualViewport 和浏览器缩放自适应
```

**识别坐标不保存浏览器 CSS 像素。**

`windowCaptureGeometry.ts` 负责：
- ROI 归一化；
- 源画面比例坐标 → 实际 source pixels；
- 预览舞台保持源画面准确宽高比；
- 判断保存校准与当前捕获画面的 aspect-ratio drift。

`ScreenInput.tsx` 的识别框始终挂在与视频源相同比例的 fitted stage 上。网页缩放、Control 栏宽变化、窗口移动只会改变 stage 的显示尺寸，不改变 ROI。

### 分辨率变化

1920×1080 → 1280×720 属于同宽高比变化，现有 ROI 可以继续使用。

1920×1080 → 1600×1200 会改变宽高比。系统保留原 ROI，但会提示导播快速检查当前槽位。

### 动态视频尺寸

共享窗口在运行中改变分辨率时，HTML video 的 source size 会重新读取，预览 stage 会同步调整，不继续使用连接时的旧尺寸。

## Recognition 与 Draft 的一致性

Recognition 请求是异步的，因此请求开始时会记录：

- revision；
- game / currentPhase；
- team；
- action。

如果请求返回时 Server state 已进入下一阶段，结果直接丢弃，不能打开 Review 并写入新的 BP 槽位。

这和 Server 自身的 revision 校验形成两层保护：

```text
Capture context guard
        +
Server revision validation
        =
旧截图不能污染新阶段
```

## 数据目录

默认：

```text
vite-project/data/lol/match.json
vite-project/data/lol/team-presets.json
vite-project/data/lol/uploads/player-portraits/
```

`DATA_FILE` 可以改变比赛数据文件位置；相关 team preset 与默认 upload 路径跟随其目录。

## Overlay 坐标

OBS Overlay 仍以 **1920×1080 固定设计画布** 为生产基准。不要通过修改浏览器 Zoom 来“校准” Overlay；OBS Browser Source 应直接设置 1920×1080。

Control / Caster 是响应式工作界面，与 Overlay 的固定播出画布职责不同。

# League Client 房间 API 自动 BP

[返回文档索引](../README.md)

## 目的

Match Settings 的 BP 输入现在推荐使用 **League Client 房间 API 自动同步**。

Broadcast Server 直接读取同一台电脑上 League Client 的 Champ Select 会话：

```text
League Client
    │
    │ local HTTPS / LCU
    ▼
GET /lol-champ-select/v1/session
    │
    ▼
server/lcu.ts
    │
    │ validated Action + current revision
    ▼
server/store.ts
    │
    ├── Control
    ├── Caster
    └── OBS Overlay
```

LCU 只作为**输入源**。它不能绕过 Store 的比赛规则、重复英雄检查、Global / Player BP 限制、revision、Undo 或持久化。

## Riot 支持边界

Riot 将 League Client API 描述为 League Client 在本机使用的接口，并明确说明这是 **unsupported service**：不保证完整文档、稳定性、正常运行时间或变更通知。

官方说明：

https://developer.riotgames.com/docs/lol#league-client-api

使用 League Client API 的产品应在 Riot Developer Portal 登记其用途。

## 启用

1. League Client 与 Broadcast Server 运行在同一台电脑。
2. 打开 League Client 并进入比赛房间。
3. Control → Match Settings。
4. BP 输入模式选择 **League Client 房间 API 自动同步**。
5. 保存设置。
6. Control 会出现 **League Client 自动 BP** 状态面板。
7. 进入 Champ Select 后，状态应从：
   - League Client：已连接
   - 英雄选择房间：等待进入 BP

   变为：
   - League Client：已连接
   - 英雄选择房间：同步中

英雄只有在 League Client 标记对应 Ban / Pick 为 `completed` 后才会写入比赛状态；Hover 不会被当成正式选择。

## 自动发现 League Client

Server 不把 LCU 密码发送到浏览器。

默认连接发现顺序：

1. `LOL_LCU_PORT` + `LOL_LCU_TOKEN` 环境变量；
2. `LOL_LCU_LOCKFILE`；
3. `LEAGUE_CLIENT_DIR/lockfile`；
4. 常见 Riot Games 安装目录的 `lockfile`；
5. Windows 上读取正在运行的 `LeagueClientUx.exe` 命令行：
   - `--app-port`
   - `--remoting-auth-token`

正常 Windows 安装通常不需要手动配置。

特殊安装可以在 `.env` 指定：

```env
LOL_LCU_PORT=12345
LOL_LCU_TOKEN=...
LOL_LCU_PROTOCOL=https
LOL_LCU_LOCKFILE=C:\Riot Games\League of Legends\lockfile
```

LCU token 是本机 League Client 的临时凭证，不应复制到网页、OBS URL、聊天或公开日志。

## Draft Turn 与阵营映射

自动同步首先使用 Champ Select `actions` 的**回合顺序**对齐项目自己的 `phases()`。因此即使赛事电脑是 Observer、没有明确的 ally/enemy 身份，也可以按第 1、2、3… 个 Draft turn 同步蓝红 Ban/Pick。

`isAllyAction` 只用于 Control 状态面板显示“本机阵营映射”。如果该字段缺失，会尝试用 `myTeam / theirTeam` 的 `cellId` 推导；仍无法判断时只显示 `—`，不会影响按 Draft turn 自动同步。

每个 LCU action 的 `type` 仍必须和对应 authoritative phase 一致；如果 turn 数量或 Ban/Pick 类型不匹配，程序会停止写入而不是猜测。

## 与手动操作共存

Hero Picker 始终保留。

如果 LCU 临时断开，导播可以直接手动录入。重新连接时，程序会先比较：

```text
程序已记录的 BP 前缀
            VS
League Client 已完成的 BP 前缀
```

两边一致才继续自动同步。

如果任何一步不同，LCU 面板会报告 mismatch，程序不会覆盖现有比赛状态。导播应先核对实际 BP，再选择 Undo / Reset Draft / 手动继续。

## 空 Ban

如果 League Client 返回一个已经完成的 Ban action，但 `championId <= 0`，程序记录为 Empty Ban / Skip Ban，对应 Store 中的 `null` Ban 槽位。

## 延迟与刷新频率

Server 默认约每 750 ms 检查一次 Champ Select。

这是状态轮询，不是截图识别，因此不受：

- Browser Zoom；
- League Client 窗口位置；
- DPI；
- 分辨率；
- OBS 画布；
- 英雄头像动画；

影响。

## 当前限制

### 1. 必须是本机 League Client

LCU 是本机接口。当前实现要求 League Client 和 Broadcast Server 在同一台机器。

如果未来 Server 迁到 VPS，应增加独立的本机 LCU Bridge，而不是把 League Client token 暴露到公网。

### 2. API 不受 Riot 官方稳定性保证

League Client 更新后 endpoint 或字段可能变化，因此 **Manual Selection 永远保留**。

旧 Screen Recognition 源码也暂时保留作为维护/兼容层，但不再出现在正常 Match Settings 流程中。

### 3. Final Lineup / Help-pick

当前 LCU 自动化负责原始 Draft Order：Ban / Pick。

最终 Champion ↔ Player ownership 继续由 Final Lineup Assignment 管理。这样不会把 League Client 的 cell 顺序错误地当成项目中的 Top / Jungle / Mid / Bot / Support 选手顺序。

## 排错

### League Client 未找到

确认：
- League Client 已经启动；
- Broadcast Server 与 League Client 在同一台电脑；
- Server 账号有权限查看 `LeagueClientUx.exe`；
- 特殊安装时配置 `LOL_LCU_LOCKFILE` 或直接提供 port/token。

### 已连接但一直等待

只有进入 Champ Select 时 `/lol-champ-select/v1/session` 才有有效会话。大厅等待阶段属于正常状态。

### Draft differs at phase N

LCU 和 Broadcast Store 在第 N 步已经不一致。不要强行继续自动化。

核对真实房间后：
- 如果程序错：Undo / Reset Draft；
- 如果 League Client 会话不是当前比赛：退出错误房间；
- 必要时切回 Manual 完成当前局。

### Client credentials changed

League Client 重启后端口和 token 可能变化。Bridge 会清除旧连接并自动重新发现；通常数秒内恢复。

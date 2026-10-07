# LoL Broadcast 文档索引

[返回项目首页](../README.md)

这里仅索引当前 **League of Legends Tournament Broadcast System** 的生产文档。HOK 阶段的旧设计、同步器和交接记录统一放在 [archive](archive/README.md)，不应作为 LoL 配置依据。

## 赛事操作

| 文档 | 用途 |
| --- | --- |
| [快速开始](guides/getting-started.md) | 安装、启动、三个入口、基础验证 |
| [导播操作指南](guides/operator-guide.md) | BP、比分、换边、队伍、Champion Studio、阵容确认 |
| [Windows 启动](guides/windows-launcher.md) | 一键启动 Server + Cloudflare Quick Tunnel |
| [Screen Recognition](guides/screen-recognition.md) | LoL BP 截图识别、20 槽校准、Review 流程 |

## 数据与维护

| 文档 | 用途 |
| --- | --- |
| [Champion Data Pipeline](research/hero-sync.md) | Data Dragon、Portrait / Splash Art、分路和 alias 维护 |
| [Research Index](research/README.md) | 当前 LoL 数据研究入口 |
| [系统架构](design/architecture.md) | authoritative state、坐标模型、Recognition 与 Overlay 边界 |
| [Validation History](validation/history.md) | 历史构建、测试与浏览器验证记录 |

## 架构边界

生产代码只认：
- `src/data/lolHeroes.ts`
- `public/champions/`
- `data/lol/`
- LoL 专用 `LOL_CAPTURE_ENABLED`
- `scripts/lol-sync.mjs`

任何 `docs/archive/hok-*`、旧 Camp ID、Flowborn / AoV 数据或 HOK Hero Sync 文档都只用于历史追溯。

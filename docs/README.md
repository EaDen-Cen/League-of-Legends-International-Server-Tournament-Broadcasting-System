# 文档总索引

[返回项目首页](../README.md)

> 此索引包含继承的 HOK 历史指南；当前 LoL 英雄、BP、存储路径和启动说明以根 README 为准。HOK 自动同步已停用。

| 类别 | 入口 | 用途 |
| --- | --- | --- |
| 当前操作 | [运行指南](guides/getting-started.md)、[操作指南](guides/operator-guide.md)、[Windows 启动器](guides/windows-launcher.md) | 安装部署与现场操作 |
| 当前设计 | [系统结构](design/architecture.md) | 代码职责、状态流与存储边界 |
| 验证记录 | [历次验证](validation/history.md) | 按日期/版本保留结果和未验收范围 |
| 研究资料 | [研究索引](research/README.md)、[英雄自动同步](research/hero-sync.md) | 英雄核查、自动同步与原始 JSON 证据 |
| 历史交接 | [归档索引](archive/README.md) | 版本交接、旧计划与原始说明 |

## 命名和维护规则

- 根目录仅放项目 README（许可证保持原位）；应用目录 README 仅说明执行入口。
- 当前指南使用稳定的小写英文连字符名称，更新原文，不为每次会话新增交接文件。
- 版本交接归入 `archive/handoffs/`，历史计划归入 `archive/planning/`；日期使用 YYYY-MM-DD。
- 测试结果写入验证记录并注明日期、环境、实际执行和未验证范围，不能混入当前操作步骤。
- 研究叙述放在 `docs/research/`，原始证据继续放在根目录 `research/`。
- 新增或移动文档同步修改本索引及相对链接；旧资料保留，不把历史需求当现状。
- 文中源码、运行数据和产物路径默认以仓库根目录为基准；npm 命令在 `vite-project/` 执行。历史原文的路径仍按其注明的原上下文理解。

## 本次整理路径清单

基线：main `bbcf24807596c75046ebb3e8a82d775c760c4dd6`。原有 12 份 Markdown（根目录 10、应用目录 2）；整理后根目录仅 1 份，应用目录仅 1 份，其余按用途进入 docs。

| 原路径 | 新位置 | 处理 |
| --- | --- | --- |
| `README.md` | [docs/archive/legacy/upstream-readme.md](archive/legacy/upstream-readme.md) | 原文归档，原位置改写为入口 |
| `START-HERE.md` | [docs/guides/getting-started.md](guides/getting-started.md) | 移动、分类并更新引用 |
| `V2.3-IMPLEMENTATION.md` | [docs/guides/operator-guide.md](guides/operator-guide.md) | 移动、分类并更新引用 |
| `vite-project/BROADCAST-LAUNCHER.md` | [docs/guides/windows-launcher.md](guides/windows-launcher.md) | 移动、分类并更新引用 |
| `VALIDATION.md` | [docs/validation/history.md](validation/history.md) | 移动、分类并更新引用 |
| `HERO-DATA-AUDIT.md` | [docs/research/hero-data-audit-2026-09-16.md](research/hero-data-audit-2026-09-16.md) | 移动、分类并更新引用 |
| `WORKFLOW.md` | [docs/archive/planning/workflow-2026-09-17.md](archive/planning/workflow-2026-09-17.md) | 移动、分类并更新引用 |
| `PRODUCTION-STATUS.md` | [docs/archive/planning/production-status-2026-09-16.md](archive/planning/production-status-2026-09-16.md) | 移动、分类并更新引用 |
| `V2-HANDOFF.md` | [docs/archive/handoffs/v2-handoff.md](archive/handoffs/v2-handoff.md) | 移动、分类并更新引用 |
| `V2.2-HANDOFF.md` | [docs/archive/handoffs/v2.2-handoff.md](archive/handoffs/v2.2-handoff.md) | 移动、分类并更新引用 |
| `V2.3-TEST-HANDOFF.md` | [docs/archive/handoffs/v2.3-test-handoff.md](archive/handoffs/v2.3-test-handoff.md) | 移动、分类并更新引用 |
| `vite-project/README.md` | [docs/archive/legacy/vite-template-readme.md](archive/legacy/vite-template-readme.md) | 原文归档，原位置改写为入口 |

保留全部原始文档的参考内容；README 原文先归档再改写入口。当前操作指南补入旧交接中仍有效的比赛流程，同时保留交接原文供溯源。没有删除参考文档，没有移动程序或素材；新增导航和系统结构说明用于避免再产生无入口的文档。

## 兼容性与风险

仓库内文档链接已随路径更新。外部聊天、书签或工具写死的旧 main 文档 URL 无法在纯 Git 仓库自动重定向；可按上表定位，或在基线提交中查看旧文件。没有为每个旧路径保留占位 MD，避免根目录再次堆积。

本次不清理旧程序组件、重复图片、IDE 文件或研究证据，因为删除可能影响其他工作流。若以后要做这些清理，应另行确认范围并验证。OBS、Cloudflare 及现场音画链路的历史未验收项继续保留。

# HOK 工作流适配到 LoL：验证记录

参考：HOK `751b2c8`；目标基线：LoL `89e92d0`。本轮只适配通用 BP 工作流，不宣称与 HOK 全功能对齐。

- `npm test`：93 项，92 通过，1 项原有平台相关检查跳过，0 失败。新增 7 项规则回归：BO7 边界、单局覆盖、锁定/Undo、历史双开关、重启/重置、延迟时序、输入校验与计划停用。
- `npm run build`：通过。保留现有超过 500 kB 的 bundle 提示。
- `npm run lint`：通过。修正原有 LCU 缩进、服务端 const 和 Champion Studio Hook 依赖。
- `CHROME_PATH=/usr/bin/chromium npx playwright test e2e/hok-upgrade.spec.ts --timeout=25000`：2 通过。覆盖 Control 实际操作、BO7 四格比分、已开始规则锁定、跨局 P1–P5 核对失效、慢图加载时快速改选/Undo。

截图生成于 `vite-project/artifacts/lol-hok-upgrade-control.png`（本地忽略目录，不加入源码）。

## 遗留端到端用例

全套原有 Playwright 用例尚未作为本轮验收通过：`broadcast-update` 中旧 Side Ban 最小宽度断言要求 72px，实际现有样式为 54px，旧 screen recognition 入口也已退出正常产品流程。该整套尝试被中止，未声称完成。

另对 `e2e/v22.spec.ts` 六项单独执行，并使用未修改的 `89e92d0` 独立 worktree 进行同环境对照；两者均为 1 通过、5 失败，失败用例相同；具体失败点可能因旧用例时序不同而变化（Panel 有阵容数量或阶段不匹配）。其余涉及 Side 旧坐标、延迟先手、排序控件旧标签、空 Ban 操作时序。旧套件不能充当本轮通过证据，该对照也不等于已排除所有回归。保留原断言，不为通过本轮检查而降低既有断言标准。

## 实机边界

本环境没有运行 Windows League Client 或真实 OBS，LCU 实机、远程解说链路、OBS 长时间图片加载及真实赛事彩排仍须按操作指南验收。数据变更向后兼容旧存档，不会自动为旧记录补造规则快照；新提交的对局保存规则快照。

# LoL Broadcast · 英雄联盟赛事 BP 转播系统

基于 HOK Broadcast 的第一轮 LoL 适配，保留 React / TypeScript / Node.js / WebSocket 架构。

- **control**：导播操作、队伍资料库、替补、选禁、阵容交换、比分与撤销。
- **caster**：按可配置延迟读取状态，保留解说视图。
- **overlay**：OBS 透明转播画面，保留横版与侧栏布局。

## 快速启动

使用 Node.js 24，在项目目录执行：

```powershell
git clone https://github.com/EaDen-Cen/League-of-Legends-International-Server-Tournament-Broadcasting-System.git
cd League-of-Legends-International-Server-Tournament-Broadcasting-System/vite-project
npm ci
npm run build
npm run server
```

本地入口：[操作台](http://127.0.0.1:3001/control#token=local-control)、[解说台](http://127.0.0.1:3001/caster#token=local-caster)、[OBS](http://127.0.0.1:3001/overlay/draft#token=local-overlay)。公网部署须在 .env 中设置三个独立口令。

## 本轮适配

- 英雄库采用 **Riot Data Dragon 16.19.1，173 位英雄**；ID 使用 Riot champion key，中文名、英文名及称号均可搜索。中文支持拼音首字母。
- 位置为上路 / 打野 / 中路 / 下路 / 辅助；英雄分路是人工初始分类，不代表实时版本统计，可在英雄资料编辑器修改。
- 默认赛事 BP 为每方 **5 Ban + 5 Pick**：首轮双方交替各禁 3 位，选取 B-RR-BB-R；第二轮 R-B-R-B 禁用，再 R-BB-R 选取。
- 保留原简化 2 Ban 模式并明确标为自定义。默认普通 BP；选手限制和队内全局 BP 保留为自定义规则，后者不是双方共同禁用全部历史选角的 Hard Fearless。
- 元流之子选项已移除。旧 HOK 英雄、关系、裁剪覆盖不参与 LoL 英雄库。
- 浏览器缓存使用 lol- 前缀，默认比赛及队伍库分别保存在 data/lol/match.json 和 data/lol/team-presets.json。**不要导入 HOK 比赛文件**，两个游戏的数字英雄 ID 会重叠。
- 173 张头像随项目本地提供，截图识别使用相同头像；加载图来自 Riot CDN，网络不可用时回退本地头像。
- 截图识别扩展为 20 个独立槽。默认手动输入；识别框初始坐标仅为校准起点，必须针对 LoL 窗口和分辨率手动校准后试用。Windows 原生捕获开关为 LOL_CAPTURE_ENABLED=1。

## 数据维护与验证

```powershell
npm run hero:sync -- 16.19.1
npm test
npm run build
npm run lint
npm run test:e2e
```

数据更新显式指定 Data Dragon 版本，重新生成英雄库与本地头像后审阅差异。数据源见 [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)。HOK 自动同步工作流和脚本已移到 docs/archive，LoL CI 仅测试与构建，不自动修改英雄资料。

原部署、队伍操作及设计说明位于 [文档索引](docs/README.md)，其中 HOK 历史示例尚未逐篇重写，LoL 差异以本 README 为准。浏览器测试需要 Chrome，可通过 CHROME_PATH 指定。

LoL Broadcast is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

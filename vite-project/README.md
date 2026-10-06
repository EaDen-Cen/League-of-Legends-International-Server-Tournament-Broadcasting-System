# 应用目录

这是 LoL Broadcast 的前端、后端和测试执行目录。项目概览见 [根 README](../README.md)，全部说明见 [文档索引](../docs/README.md)。

使用 Node.js 24，以下命令在本目录执行：

```powershell
npm ci
npm run build
npm run server
```

开发时保持后端运行，在另一个终端执行 `npm run dev`。验证命令为 `npm test`、`npm run lint`、`npm run build`、`npm run test:e2e`；浏览器测试需要 Chrome，可通过 `CHROME_PATH` 指定路径。

- [运行、部署与备份](../docs/guides/getting-started.md)
- [比赛操作及队伍资料库](../docs/guides/operator-guide.md)
- [Windows 启动器](../docs/guides/windows-launcher.md)
- [系统结构](../docs/design/architecture.md)

启动器、配置、源码、图片和测试素材保持原位置。`data/` 和 `artifacts/` 是本机生成目录；备份应覆盖比赛、队伍资料库及上传图片。原 Vite 模板说明见 [历史归档](../docs/archive/legacy/vite-template-readme.md)。

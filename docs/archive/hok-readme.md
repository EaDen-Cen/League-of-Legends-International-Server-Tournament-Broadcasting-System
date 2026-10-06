# HOK Broadcast · 王者荣耀赛事 BP 导播系统

基于 React、TypeScript、Node.js 与 WebSocket，提供操作台、延迟解说台及 OBS 直播画面。当前 main 包含 V2.3 导播快捷录入、选手照片上传、服务器端队伍资料库及替补快速换人。

## 快速启动

使用 Node.js 24，首次下载并启动：

```powershell
git clone https://github.com/EaDen-Cen/HOK_Ban_Pick.git
cd HOK_Ban_Pick/vite-project
npm ci
npm run build
npm run server
```

本机开发入口：[操作台](http://127.0.0.1:3001/control#token=local-control)、[解说台](http://127.0.0.1:3001/caster#token=local-caster)、[OBS](http://127.0.0.1:3001/overlay/draft#token=local-overlay)。这些口令仅用于本机开发；公网部署按运行指南配置独立口令。

<!-- HERO-SYNC:ROSTER:START -->
## 程序内英雄池

当前 `main` 分支程序内共有 **118 个有效英雄条目**。英雄 ID 与程序持久化数据直接关联，因此旧 ID 不会复用；**ID 29 为历史保留空位**，不属于当前英雄池。

> 本表由 Hero Data Synchronizer 自动生成，用于快速核对程序当前实际包含的英雄。请勿手工维护表格；英雄同步 PR 会自动刷新这里。

| ID | 中文名 | English |
| ---: | --- | --- |
| 1 | 阿古朵 | Agudo |
| 2 | 莱西奥 | Alessio |
| 3 | 亚连 | Allain |
| 4 | 安琪拉 | Angela |
| 5 | 公孙离 | Arli |
| 6 | 亚瑟 | Arthur |
| 7 | 猪八戒 | Ata |
| 8 | 雅典娜 | Athena |
| 9 | 大司命 | Augran |
| 10 | 狂铁 | Biron |
| 11 | 刀锋宝贝 | Butterfly |
| 12 | 蔡文姬 | Cai Yan |
| 13 | 西施 | Shi |
| 14 | 夏洛特 | Charlotte |
| 15 | 云中君 | Cirrus |
| 16 | 虞姬 | Consort Yu |
| 17 | 大乔 | Da Qiao |
| 18 | 妲己 | Daji |
| 19 | 达摩 | Dharma |
| 20 | 狄仁杰 | Di Renjie |
| 21 | 典韦 | Dian Wei |
| 22 | 貂蝉 | Diaochan |
| 23 | 朵莉亚 | Dolia |
| 24 | 东皇太一 | Donghuang |
| 25 | 扁鹊 | Dr Bian |
| 26 | 夏侯惇 | Dun |
| 27 | 少司缘 | Dyadia |
| 28 | 艾琳 | Erin |
| 30 | 老夫子 | Fuzi |
| 31 | 干将莫邪 | Gan & Mo |
| 32 | 高渐离 | Gao |
| 33 | 伽罗 | Garo |
| 34 | 关羽 | Guan Yu |
| 35 | 鬼谷子 | Guiguzi |
| 36 | 韩信 | Han Xin |
| 37 | 海诺 | Heino |
| 38 | 后羿 | Hou Yi |
| 39 | 黄忠 | Huang Zhong |
| 40 | 镜 | Jing |
| 41 | 凯 | Kaizer |
| 42 | 诸葛亮 | Kongming |
| 43 | 钟馗 | Kui |
| 44 | 孙尚香 | Lady Sun |
| 45 | 甄姬 | Lady Zhen |
| 46 | 澜 | Lam |
| 47 | 李白 | Li Bai |
| 48 | 李信 | Li Xin |
| 49 | 廉颇 | Lian Po |
| 50 | 张良 | Liang |
| 51 | 刘邦 | Liu Bang |
| 52 | 刘备 | Liu Bei |
| 53 | 刘禅 | Liu Shan |
| 54 | 敖隐 | Ao'yin |
| 55 | 吕布 | Lu Bu |
| 56 | 劳拉 | Luara |
| 57 | 鲁班七号 | Luban No.7 |
| 58 | 露娜 | Luna |
| 59 | 不知火舞 | Mai Shiranui |
| 60 | 马可波罗 | Marco Polo |
| 61 | 姬小满 | Mayene |
| 62 | 蒙犽 | Meng Ya |
| 63 | 梦奇 | Menki |
| 64 | 米莱狄 | Milady |
| 65 | 明世隐 | Ming |
| 66 | 墨子 | Mozi |
| 67 | 花木兰 | Mulan |
| 68 | 宫本武藏 | Musashi |
| 69 | 娜可露露 | Nakoruru |
| 70 | 哪吒 | Nezha |
| 71 | 女娲 | Nuwa |
| 72 | 裴擒虎 | Pei |
| 73 | 兰陵王 | Gao Changgong |
| 74 | 王昭君 | Wang Zhaojun |
| 75 | 上官婉儿 | Shangguan |
| 76 | 百里守约 | Shouyue |
| 77 | 司马懿 | Sima Yi |
| 78 | 孙膑 | Sun Bin |
| 79 | 孙策 | Sun Ce |
| 80 | 橘右京 | Ukyo Tachibana |
| 81 | 孙悟空 | Wukong |
| 82 | 钟无艳 | Wuyan |
| 83 | 项羽 | Xiang Yu |
| 84 | 小乔 | Xiao Qiao |
| 85 | 杨戬 | Yang Jian |
| 86 | 曜 | Yao |
| 87 | 瑶 | Yaria |
| 88 | 杨玉环 | Yuhuan |
| 89 | 李元芳 | Fang |
| 90 | 张飞 | Zhang Fei |
| 91 | 周瑜 | Zhou Yu |
| 92 | 庄周 | Zhuangzi |
| 93 | 赵云 | Zilong |
| 94 | 姜子牙 | Ziya |
| 95 | 云樱 | Ying |
| 96 | 芈月 | Mi Yue |
| 97 | 元歌 | Yango |
| 98 | 元流之子（坦克） | Flowborn (Tank) |
| 99 | 迦楼罗 | Garuda |
| 100 | 阿轲 | Arke |
| 101 | 白起 | Bai Qi |
| 102 | 法提赫 | Fatih |
| 103 | 影 | Umbrosa |
| 104 | 元流之子（射手） | Flowborn (Marksman) |
| 105 | 拉普拉普 | Lapulapu |
| 106 | 苍 | Chano |
| 107 | 百里玄策 | Xuance |
| 108 | 安奈特 | Annette |
| 109 | 弈星 | Yixing |
| 110 | 桑启 | Sakeer |
| 111 | 海月 | Haya |
| 112 | 谛梵罗 | Devara |
| 113 | 暃 | Feyd |
| 114 | 蚩奼 | Chicha |
| 115 | 弗洛伦 | Florentino |
| 116 | 洛里昂 | Lorion |
| 117 | 元流之子（法师） | Flowborn (Mage) |
| 118 | 元流之子（刺客） | Flowborn (Assassin) |
| 119 | 元流之子（辅助） | Flowborn (Roamer) |
<!-- HERO-SYNC:ROSTER:END -->

## 文档导航

| 需要做什么 | 文档 |
| --- | --- |
| 安装、三端接入、延迟、备份和部署 | [运行指南](docs/guides/getting-started.md) |
| 比赛流程、快捷 BP、照片、队伍库及替补 | [操作指南](docs/guides/operator-guide.md) |
| Windows 一键启动及 Cloudflare | [启动器说明](docs/guides/windows-launcher.md) |
| 理解源码目录和状态流 | [系统结构](docs/design/architecture.md) |
| 查看项目阶段与未来路线 | [项目里程碑](MILESTONES.md) |
| 查看历次测试及未验收范围 | [验证记录](docs/validation/history.md) |
| 查英雄资料来源 | [研究索引](docs/research/README.md) |\n| 自动检查英雄名单更新 | [英雄数据自动同步](docs/research/hero-sync.md) |
| 查旧交接、旧计划和原项目介绍 | [历史归档](docs/archive/README.md) |
| 查全部文档、旧路径去向及维护规则 | [文档总索引](docs/README.md) |

## 仓库结构

```text
README.md           项目入口
LICENSE.txt         MIT 许可
docs/               当前指南、设计、验证、研究索引、历史归档
research/           英雄研究原始 JSON 证据（保留原路径）
deploy/             Docker Compose / Caddy / 环境变量示例
vite-project/       应用与 npm 命令执行目录
  src/              前端、共享类型与 BP 规则
  server/           状态存储、HTTP/WS、上传与队伍资料库
  e2e/              浏览器测试与测试素材
  public/           静态图片
  data/             运行时比赛、队伍库、上传图片（不入库）
  artifacts/        本机测试截图、日志等（不入库）
```

开发和验证命令见 [应用目录说明](vite-project/README.md)。OBS、跨设备公网和音画同步仍需真实设备彩排；历史自动测试结果不能代替现场验收。

基于 qiqi47 的原项目，保留原英雄数据及 [MIT 许可](LICENSE.txt)。[原中英文 README](docs/archive/legacy/upstream-readme.md) 已完整归档，其旧站点及旧安装说明仅作历史参考。

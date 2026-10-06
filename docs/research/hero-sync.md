# LoL Champion Data Pipeline

[返回 Research Index](README.md)

## 目标

LoL 版本只维护一套生产 Champion 基线：

```text
Riot Data Dragon
  ↓
scripts/lol-sync.mjs
  ├─ public/champions/*.png
  └─ src/data/lolHeroes.ts
        ↓
     HeroList.tsx
        ↓
Control / Caster / Overlay / Recognition
```

当前生成基线：**Data Dragon 16.19.1 / 173 Champions**。

## 字段语义

每个 Champion 的核心字段：

- `id`：Riot champion key，作为程序稳定身份；
- `englishName`：Data Dragon `en_US.name`；
- `chineseName`：Data Dragon `zh_CN.name`；
- `imageLink`：本地 `/champions/<RiotId>.png` Portrait；
- `artLink`：Data Dragon `champion/splash/<RiotId>_0.jpg`；
- `occupation` / `altOccupation`：赛事初始分路；
- `aliases`：Riot 字符串 ID、英文 title、中文 title 等搜索名。

中文英雄名和“称号”不能互换。同步脚本必须把 `zh_CN.name` 写入 `chineseName`，`zh_CN.title` 只能作为 alias。

## Portrait 与 Splash Art

```text
Portrait
→ Hero Picker / Ban / Draft History / Recognition
→ 本地文件，比赛时不依赖 CDN

Splash Art
→ Broadcast Pick Card / Champion Studio
→ 横向赛事素材，按布局实时裁切
```

Splash Art 加载失败时 Overlay 回退到本地 Portrait。

## 分路

Data Dragon 不提供本项目所需的稳定“赛事默认五位置”字段，因此 `lol-sync.mjs` 保留人工初始分路表。

同步遇到一个未分类的新 Champion 时会直接失败并要求人工补充，避免把新英雄静默分到错误位置。

比赛现场可以通过 Champion Studio 设置 Primary / Secondary Lane override。

## 同步

```powershell
cd vite-project
npm run hero:sync -- 16.19.1
```

更新版本时显式传入新版本：

```powershell
npm run hero:sync -- <Data-Dragon-version>
```

同步完成后必须：

```powershell
npm test
npm run build
npm run lint
```

## Runtime Override

Champion Studio 的数据与裁切修改属于 Match State：

- `heroDataOverrides`
- `heroArtOverrides`

它们不会修改 `lolHeroes.ts`，也不会被当作下一次 Data Dragon 同步的基线。

## 已停用的 HOK 链路

以下概念不属于 LoL 生产数据：
- Camp ID；
- Honor of Kings hero catalog；
- AoV crossover；
- Flowborn variant group；
- HOK official pick rate；
- HOK Counter / Combo / Be Countered；
- `autoSyncedHeroes.ts`；
- `heroSyncOverrides.ts`；
- `heroArtSourceOverrides.ts`。

旧实现保存在 `docs/archive/hok-hero-sync/`，仅用于历史追溯。

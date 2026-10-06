# LoL Screen Recognition

[返回文档索引](../README.md)

Screen Recognition 是导播辅助工具，不应绕过人工确认。

## 启用

1. 在 `vite-project/` 完成 `npm ci` 与 `npm run build`。
2. Match Settings 把 **BP Input Mode** 切换为 Screen Recognition。
3. 如需 Windows 原生窗口捕获，在主机 `.env` 设置：

```env
LOL_CAPTURE_ENABLED=1
```

4. 启动 `npm run server` 或 `start-broadcast.bat`。
5. 只从本机 Control 使用捕获功能。

## LoL 校准

LoL 标准 Draft 涉及双方最多 20 个独立识别槽：

- Blue Bans × 5
- Red Bans × 5
- Blue Picks × 5
- Red Picks × 5

仓库内默认坐标只作为起点。不同客户端比例、窗口模式、显示缩放、语言和直播裁切都会改变实际位置。

正式比赛前必须：
1. 选择真实比赛窗口；
2. 对每个槽校准 ROI；
3. 用多位 Champion 测试；
4. 检查空 Ban；
5. 检查第二轮 Ban / Pick；
6. 完成一次完整 Draft 彩排。

## 识别素材

识别模板使用 `public/champions/` 中的本地 Data Dragon Portrait，与 Hero Picker 使用同一套 Champion ID。

Broadcast Card 的 Splash Art 不参与识别；它只负责转播视觉。

## Review Required

任何识别结果都应先进入 Review，再由导播确认。低置信度、空槽、客户端动画中的过渡帧都不应自动写入正式 Draft。

出现异常时优先切回 Manual。比赛状态由服务器维护，因此切换输入方式不会要求重建比赛。

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

每个 ROI 保存为：

```text
x / y / width / height ∈ 0–1
```

这些值相对于**捕获源画面**，不是相对于网页 CSS 像素。预览区域会先根据真实 source width / height 计算一个保持完全相同比例的 fitted stage，然后识别框才绘制在这个 stage 上。

因此下面这些变化不会再改变 ROI：

- 浏览器 Zoom；
- Control 页面宽度变化；
- 浏览器窗口移动；
- Windows UI 缩放；
- 1920×1080 → 1280×720 这类同宽高比 source resize。

如果 source aspect ratio 真正改变，例如 16:9 → 4:3，系统保留原校准但会给出警告，要求导播检查当前槽。

正式比赛前仍建议：

1. 选择真实 League Client 窗口；
2. 对 20 个槽逐个校准；
3. 用多位 Champion 测试；
4. 检查空 Ban；
5. 检查第二轮 Ban / Pick；
6. 改一次浏览器 Zoom，确认框仍贴合；
7. 完成一次完整 Draft 彩排。

## 识别素材

识别模板使用 `public/champions/` 中的本地 Data Dragon Portrait，与 Hero Picker 使用同一套 Champion ID。

Broadcast Card 的 Splash Art 不参与识别；它只负责转播视觉。

## Review Required

任何识别结果都应先进入 Review，再由导播确认。低置信度、空槽、客户端动画中的过渡帧都不应自动写入正式 Draft。

Recognition 请求发出时会绑定当前 revision 与 Draft Phase。若识别仍在计算时有人手动推进 BP，旧结果返回后会直接被丢弃；即使 Review 已打开，确认前也会再次检查 phase / revision。这样旧截图不能污染下一阶段。

出现异常时优先切回 Manual。比赛状态由服务器维护，因此切换输入方式不会要求重建比赛。

## Browser Capture 与 Native Capture

**Browser Window Capture（推荐）**
- 读取用户明确选择的窗口；
- ROI 使用 normalized source coordinates；
- 对网页缩放和响应式布局稳定；
- 不需要 Windows 桌面绝对坐标。

**Native Windows Capture（兼容模式）**
- 依赖 Windows 桌面像素坐标；
- 移动窗口、改变显示器布局或 DPI 后可能需要重新输入区域；
- 仅在 Browser Window Capture 不可用时使用。

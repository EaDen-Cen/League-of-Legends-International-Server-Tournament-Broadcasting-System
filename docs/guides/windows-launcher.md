# Windows 一键启动与 Cloudflare

[返回文档索引](../README.md)

首次使用或更新源码后：

```powershell
cd vite-project
npm ci
npm run build
```

之后双击：

```text
start-broadcast.bat
```

启动器会：

1. 停止占用 3001 的旧 LoL Server；
2. 停止旧 `cloudflared.exe`；
3. 检查 Node / npm / cloudflared；
4. 启动 LoL Broadcast Server；
5. 等待本地服务 Ready；
6. 启动 Cloudflare Quick Tunnel；
7. 把公网地址写入 `artifacts/current-public-url.txt`；
8. 打开本机 Control。

本机导播始终优先使用：

```text
http://127.0.0.1:3001/control
```

Caster 和 OBS 可以使用生成的 HTTPS 公网地址。

运行期间不要关闭 Server 和 Cloudflare 窗口。结束比赛后双击：

```text
stop-broadcast.bat
```

## 排错

检查：
- `artifacts/cloudflared.log`
- LoL Broadcast Server 窗口
- `http://127.0.0.1:3001/api/health`

Quick Tunnel 地址每次启动可能变化。需要固定域名时使用 `deploy/` 中的长期部署方案，而不是把随机 tunnel URL 写进 OBS 永久配置。

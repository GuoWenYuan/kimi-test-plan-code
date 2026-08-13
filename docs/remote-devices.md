# 远程设备：手机操作公司/家里电脑上的 AI 工具

让手机（或任何外端）登录 workbench 后，在「AI 工具」页看到同账号下各台机器自动上报的工具，一键打开该机器上工具的**完整 Web 界面**远程干活。

## 拓扑

```
手机浏览器
  │  http://<frps地址>:39100        ← workbench 本身（登录、设备列表）
  │  http://<frps地址>:39101/39102  ← 各机器的工具 Web UI
  ▼
frps（公网入口：workbench 服务器有公网 IP 时直接跑在服务器 compose 里；否则跑在公网 VPS）
  ▲ 控制连接 :7000（frpc 主动外连，机器在 NAT 后也可以）
  │
frpc（每台存放工具的机器常驻）── 本机 127.0.0.1:58627 (kimi web) / :3000 (workbench)
```

两个组件分工：

- **frp 隧道**：把每台机器的本机工具端口映射为 frps 上的独立公网端口（一工具一端口，根路径不变，HTTP/SSE/WebSocket 全兼容）。
- **统一桥心跳**（`tools/workbench-bridge.mjs`）：每台机器跑一个零依赖 Node 脚本（同时兼任快捷指令本机桥与知识库 MCP），配置 `bridge.json` 的 `device` 段后每 30s 向 workbench 上报设备名、工具清单、本机端口在线状态；/tools 页「远程设备」区块据此展示，按钮地址就是 frp 穿透地址。

## 一、部署 frps（二选一）

- **服务器有公网入口**：本仓库 compose 已含 `frps` 服务。编辑 `frp/frps.toml` 把 `auth.token` 改成强随机值，`sudo docker compose up -d frps` 即可。云防火墙/安全组放行 7000 与 39100-39110。
- **服务器在内网**：把 frps 部署到任一公网 VPS：下载 [frp 发布包](https://github.com/fatedier/frp/releases)，用本仓库 `frp/frps.toml` 启动（`./frps -c frps.toml`），同样放行端口段。

## 二、每台机器部署 frpc + 统一桥

以「公司电脑」为例（家里电脑重复一遍，remotePort 换不同端口）：

1. 下载 frp 发布包，取其中 `frpc`；参照 `frp/frpc.example.toml` 写 `frpc.toml`：serverAddr 填 frps 地址，token 与 frps 一致，把本机工具端口逐个映射到唯一 remotePort。启动：`./frpc -c frpc.toml`（常驻：pm2 / systemd / Windows 计划任务）。
2. workbench「AI 工具」页「远程设备 → 接入新设备」下载统一桥 `workbench-bridge.mjs`，复制 `bridge.json` 模板，逐项填写：
   - `workbench.url`：workbench 的访问地址（frp 穿透后的或内网地址均可，桥能连到即可）
   - `workbench.apiToken`：个人 API 令牌（workbench「知识库」页「MCP 接入」区获取/重置）
   - `device.endpoints[].remoteUrl`：`http://<frps地址>:<remotePort>`，与 frpc.toml 一一对应
   - `device.endpoints[].token`：工具自身访问令牌（可选）。填了手机端点「打开」自动携带；不填则首次手动输入（存手机浏览器本地）
3. 运行 `node workbench-bridge.mjs --no-serve`（Node ≥ 18；常驻同 frpc；`--no-serve` 表示只跑心跳、不开本机 HTTP 桥）。日志出现「心跳成功」后，/tools 页即出现该设备。

## 三、手机使用

1. 手机浏览器打开 `http://<frps地址>:39100`（或 workbench 穿透后的地址），登录账号。
2. 「AI 工具」页下拉至「远程设备」，点对应工具的「打开」，新标签页即为该机器上工具的完整界面，正常操作即可。

## 安全须知（务必逐项确认）

- 391xx 端口**公网可达**，安全性完全依赖工具自身令牌：kimi web 用 `kimi server rotate-token` 生成强令牌；其他工具同理，必须开启各自的访问令牌。
- `frps.toml` 的 `auth.token` 必须改强随机值，防止他人 frpc 挂到你的 frps 上抢端口。
- 防火墙只放行需要的端口段（7000、39100-39110），不要把整段高位端口暴露。
- http 裸 IP 是非安全上下文，部分浏览器 API 不可用（workbench 前端已做兼容）；条件允许建议上域名 + HTTPS（frp vhost 或外层 nginx 终结 TLS）。
- 停用某台机器：停掉它的 frpc 与统一桥心跳进程，并在 /tools 页「删除设备」。

## 常见问题

- **设备卡片显示离线**：设备 90s 无心跳即离线。检查 agent 日志（401 = 令牌失效；连接失败 = server 地址不通）。
- **设备在线但工具圆点灰**：agent 探测本机 `localPort` 无监听，工具没启动或端口填错。
- **打开后连接被拒绝**：frpc 未运行 / remotePort 被占 / frps 防火墙未放行该端口。
- **frpc 启动报端口冲突**：remotePort 全 frps 唯一，给每台机器分段（如公司 39101-39102、家里 39103-39104）。

# PIAgent 本机部署文档

把 pi-service 部署到你自己的电脑上，通过「个人工作站」的 **AI 工具** 页（或直接浏览器）使用——所有文件读写、命令执行都发生在**你的电脑**上，不经过任何服务器。

## 1. 它是什么

`pi-service` 是一个零依赖（除 pi 本身）的 Node.js 服务，把 [Pi coding agent](https://pi.dev) CLI 包装成 HTTP/SSE 接口，并自带一个聊天网页：

- `GET /` — 内置聊天网页（本文档的主要使用方式）
- `POST /chat` — 对话接口（SSE 流式，网页即调用它）
- `GET /health` — 健康检查

在你电脑上运行时，pi agent 直接以**你的用户权限**读写文件、执行命令（内置 read/write/edit/bash 等工具），目录不限。

## 2. 前置要求

- **Node.js ≥ 24**（必须，pi 与 node:sqlite 都需要）：`node -v` 确认。Windows 官网下载 LTS 即可
- 一个模型服务的 Base URL + API Key + 模型 ID（DeepSeek、Kimi、OpenAI 兼容端点均可）
- Windows / macOS / Linux 均可

## 3. 安装

```bash
# 把仓库（或至少 pi-service 目录）拷到你电脑上
cd pi-service
npm install --allow-remote=all
```

> `--allow-remote=all` 是因为 pi 依赖链里有一个 tgz URL 类型的依赖，新版 npm（≥12）默认拒绝。
> 如果你的 npm 是 11 及以下，直接 `npm install` 即可。

## 4. 安装社区扩展包（可选但推荐）

与服务器版一致，装这 7 个包（MCP、联网、计划/目标模式、子代理、记忆、待办）：

```bash
export PI_CODING_AGENT_DIR=$PWD/data/pi-agent        # Windows PowerShell: $env:PI_CODING_AGENT_DIR="$PWD\data\pi-agent"
export NPM_CONFIG_ALLOW_REMOTE=all                   # PowerShell: $env:NPM_CONFIG_ALLOW_REMOTE="all"
./node_modules/.bin/pi install npm:pi-mcp-adapter    # Windows 用 node_modules\.bin\pi.cmd
./node_modules/.bin/pi install npm:pi-web-access
./node_modules/.bin/pi install npm:@narumitw/pi-plan-mode
./node_modules/.bin/pi install npm:@narumitw/pi-goal
./node_modules/.bin/pi install npm:pi-subagents
./node_modules/.bin/pi install npm:pi-hermes-memory
./node_modules/.bin/pi install npm:@juicesharp/rpiv-todo
```

> hermes-memory 依赖 better-sqlite3 原生模块：若启动报 "Could not locate the bindings file"，
> 在 `data/pi-agent/npm` 下执行 `npm rebuild better-sqlite3`（需本机有编译工具链；
> Windows 装 "Desktop development with C++" 构建工具）。
> 各包中文使用说明见工作站知识库（#PI 标签）。

## 5. 启动

```bash
npm start          # 默认 127.0.0.1:39273
# 自定义端口：PORT=39280 npm start        # Windows PowerShell: $env:PORT=39280; npm start
# 开启访问令牌（推荐，防本机其他网页冒用）：
#   Linux/macOS:  PI_SERVICE_TOKEN=你的随机串 npm start
#   PowerShell:   $env:PI_SERVICE_TOKEN="你的随机串"; npm start
```

数据（会话、扩展包、记忆）都落在 `data/pi-agent/`，删除即重置。

## 6. 使用（两种方式）

**方式一：直接开浏览器**（最简单）

打开 `http://127.0.0.1:39273/`，在页面右上角「⚙ 模型设置」填 Base URL / API Key / 模型 ID（存浏览器 localStorage，不离开你的电脑），即可聊天。Kimi Code 端点（api.kimi.com/coding）会自动走 Anthropic 协议，其他按 OpenAI 兼容处理。

也支持 URL hash 自动配置：`http://127.0.0.1:39273/#preset=<base64url(JSON {name,model,baseUrl,apiKey})>`——页面加载时写入 localStorage 并立即清除 hash（防 key 残留地址栏）。工作站的「AI 工具」页嵌入/打开 PIAgent 本机版时会用此方式自动带入你账号里选中的模型预设（需本机 pi-service 为最新版）。

**方式二：经工作站「AI 工具」页**（类 Kimi Web UI）

在工作站 `/tools` 页找到「PIAgent 本机版」卡片：页面会探测你本机 39273 是否在线，点「嵌入打开」直接把上面的聊天网页嵌进工作站，或「新标签打开」。探测因浏览器私网保护可能误报离线，以实际能打开为准。

## 7. 与服务器版（Server-PIAgent）的区别

| | Server-PIAgent（/pi 页） | PIAgent 本机版（本文档） |
| --- | --- | --- |
| 运行位置 | 部署服务器（Docker） | 你自己的电脑 |
| 操作对象 | 仅服务器文件/命令 | 你本机的文件/命令 |
| 模型配置 | 工作站「模型」页预设 | 聊天页「模型设置」（localStorage） |
| 权限 | 仅 guowenyuan | 你自己（可选 PI_SERVICE_TOKEN 保护） |
| 会话存储 | 服务器 data/pi-agent | 本机 data/pi-agent |

## 8. 常见问题

- **聊天报 401**：服务设了 `PI_SERVICE_TOKEN` 而页面「模型设置」里令牌没填或填错
- **端口被占**：`PORT=<其他端口> npm start`，/tools 页卡片上同步改端口
- **模型报错 401/404**：检查 Base URL 是否带 `/v1` 等后缀（各家不同）、模型 ID 是否正确
- **扩展包不生效**：确认第 4 步的 `PI_CODING_AGENT_DIR` 与启动服务时的一致（默认 `data/pi-agent`）
- **Windows 路径**：聊天里让 pi 操作文件时直接给 Windows 路径（如 `E:\master`）即可

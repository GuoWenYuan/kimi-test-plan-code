# AI 工作台用量面板（Chrome 扩展）

在本机 AI 工具页面右下角注入一个可收起的用量面板：余额、5h/本周额度、24h token 输入/输出与缓存命中率。数据来自你的 AI 工作台（`/api/usage/summary`，个人 API 令牌认证），令牌只存本机浏览器。

## 注入的页面

- Kimi Web UI：`http://127.0.0.1:58627`（含 localhost）
- PIAgent 本机版：`http://127.0.0.1:39273`（含 localhost）

端口改过的话，在 `manifest.json` 的 `content_scripts.matches` 里同步修改后重新加载扩展。

## 安装

1. `chrome://extensions` 开启开发者模式，「加载已解压的扩展程序」选择本目录（或解压 `usage-panel.zip` 后加载）
2. 点扩展图标打开设置：填工作台地址（如 `http://<服务器IP>:3000`）和个人 API 令牌（工作台「知识库」页 →「MCP 接入」获取）
3. 打开本机 Kimi Web UI 或 PIAgent 页面，点右下角「用量」

面板展开后每 5 分钟自动刷新，也可手动点「刷新」。

## 文件

- `manifest.json` — MV3 清单
- `background.js` — 代理拉取工作台用量（30s 缓存），打开选项页
- `content.js` — 面板注入与渲染
- `options.html` / `options.js` — 设置页（工作台地址 + 令牌）

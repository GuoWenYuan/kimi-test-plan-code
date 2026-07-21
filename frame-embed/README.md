# AI 工作台控制台内嵌助手（Chrome 扩展）

让 AI 工作台（/models 页「用量」）能够 iframe 内嵌大模型官方控制台页面
（DeepSeek、Kimi Code、Kimi 开放平台），显示比 API 更详细的用量信息。

## 原理

官方控制台通过 `X-Frame-Options` / CSP `frame-ancestors` 禁止被跨源 iframe 嵌入。
本扩展使用 `declarativeNetRequest` 仅对以下条件的响应移除这些头：

- 域名：`deepseek.com`、`kimi.com`、`kimi.ai`、`moonshot.cn`、`right.codes`（含子域）
- 资源类型：仅 `sub_frame`（被 iframe 加载的文档）——**不影响你正常访问这些网站**

另有一条规则为 `sub_frame` 的 `Set-Cookie` 追加 `SameSite=None; Secure`，
解决 iframe 内第三方 Cookie 被浏览器拦截导致的"已登录却显示未登录"问题。

点击扩展图标可切换 ON / OFF（徽章显示状态），不需要时建议关掉。

## 安装

1. 解压 `frame-embed.zip`（或直接使用本目录）
2. Chrome 打开 `chrome://extensions/`，右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择 `frame-embed` 目录
4. 确认扩展图标徽章为 ON，然后刷新工作台页面，点预设卡片的「用量」

## 注意

- 本扩展只移除**响应头**层面的嵌入限制；个别站点若用 JS 检测 `window.top`
  防嵌（frame-busting），仍可能无法正常内嵌
- 移除 CSP 会降低这些页面在 iframe 内的 XSS 防护（仅限 sub_frame、仅限上述域名），
  请只在你信任的工作台页面中使用
- 需要先在浏览器中登录对应平台控制台（iframe 共享浏览器的登录态）

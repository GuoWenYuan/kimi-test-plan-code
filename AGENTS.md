<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 项目说明：个人工作站（后台管理 + workbench）

两套共存功能：**用户后台管理**（用户管理）与 **workbench 个人工作台**（工作流、知识库、模型预设、提示词、自定义节点），统一登录体系与布局。

## 技术栈与命令

- Next.js 16（App Router，Turbopack）+ React 19 + TypeScript + Tailwind CSS 4
- 开发：`npm install` → `npm run dev`；生产：`npm run build && npm run start`（端口 3000）
- **Docker 部署（当前线上方式）**：`sudo docker compose build && sudo docker compose up -d`（docker 命令需 sudo）。两个服务：**workbench**（主应用，3000:3000，`./data:/app/data` 卷持久化 SQLite）与 **pi-service**（仅 compose 内网，`./data/pi-agent:/data/pi-agent` 卷）。pi-service 的 `npm ci` 需 `allow-remote all`（npm 12 拒绝 remote tgz 依赖）
- `next build` 不内嵌 lint，需单独 `npm run lint`
- 存储：**SQLite 单文件**（Node 内置 `node:sqlite`），路径由 `DATABASE_PATH` 指定，默认 `data/app.db`（已 gitignore）。旧 JSON 一次性迁移在 `src/lib/db.ts`（导入后旧文件改名 `*.migrated.bak`）

## 功能与结构

- 认证：登录页 + HttpOnly session cookie；`/register` 公开注册（角色固定 `user`，注册成功自动登录）；角色 `super_admin` / `user`；**权限校验全部在服务端**（每个页面和 Route Handler 独立校验）
- 用户管理（仅 super_admin）：查看所有用户及明文密码、创建/删除（不能删自己）、改密码/角色

### workbench（所有登录用户可用）

- 工作流编辑器 `/workflows`：可视化编排、SSE 流式运行、AI 生成、自定义节点；节点间传 JSON 值，下游用 `{{input.字段}}` / `{{节点名.字段}}` 引用；「输入取值」只接收上游某字段、「输入格式」声明供「格式转换」节点读取转换
- 知识库 `/knowledge`：Markdown 笔记、标签、图谱、文件上传转换（走 tools/ Python 管线）
- 模型预设 `/models`：name/model/baseUrl/apiKey；「用量」按平台映射（`src/lib/usage-pages.ts`）iframe 内嵌官方控制台，需配套 Chrome 扩展 **`frame-embed/`**（MV3 DNR 移除 X-Frame-Options/CSP、Set-Cookie 追加 SameSite=None;Secure），经 `GET /api/frame-embed` 下载
- 提示词 `/prompts`：分组模板管理
- AI 工具 `/tools`：外置 AI 网页工具入口（纯静态注册表 `src/lib/ai-tools.ts`，客户端直接引用）。**本机模式**：工具运行在用户自己电脑，浏览器直连 `127.0.0.1:<port>` 不过服务器；令牌由用户填写存 localStorage（`#token=` 拼 URL），服务端不持有。已注册：Kimi Web UI、PIAgent 本机版（`modelPreset: true` 的工具支持预设下拉，以 `#preset=<base64url(JSON)>` 自动配置）
- Unity 控制 `/unity`：`unity-bridge/Editor/UnityBridge.cs` 放入 Unity 工程，127.0.0.1:39271 起 HTTP 服务，浏览器直连本机桥（不过服务器）；`UnityBridge.Register()` 可扩展命令
- 通用本机桥 `tools/local-bridge.mjs`（`GET /api/local-bridge` 下载）：用户本机运行 `node local-bridge.mjs --root <目录> [--allow-write] [--allow-run]`，仅监听 127.0.0.1、X-Bridge-Token 认证；只读 fs.tree/fs.read/fs.grep/fs.readAny 默认开启，fs.write/fs.mkdir/sys.run 需 flag 门控。**注意：桥脚本由 workbench 镜像 COPY 提供，改后需重建镜像重下载**
- Server-PIAgent `/pi`（**仅超管 guowenyuan**，页面/接口/侧边栏三处校验；只访问服务器）：pi CLI 封装为独立服务 **pi-service**（`pi-service/server.mjs`，compose 内网 39273 不发布宿主机，`PI_SERVICE_TOKEN` 头校验）。主应用 `POST /api/pi/chat` 经 `src/lib/pi-runner.ts` 透传 SSE；pi-service spawn `pi --mode json --provider workbench --session-id <UUID>`（stdin 必须 ignore 否则挂起；**json 模式遇模型错误不改退出码，必须检查事件里 stopReason:"error"**）；多轮靠同一 sessionId（卷持久化）；网页端会话存浏览器 localStorage。pi-service 另内置聊天网页（`public/index.html`）+ `DEPLOY.md` 供用户本机部署（PIAgent 本机版）
- pi-service 社区包：`pi install npm:<pkg>`（需 `NPM_CONFIG_ALLOW_REMOTE=all`）装入 `data/pi-agent/npm/`：pi-mcp-adapter、pi-web-access、@narumitw/pi-plan-mode、@narumitw/pi-goal（⚠️ 自主性强曾自行 git commit，慎用）、pi-subagents、pi-hermes-memory（better-sqlite3 原生模块**必须在容器同 glibc 环境编译**：`docker run --rm -v .../data/pi-agent:/data -w /data/npm node:24-bookworm npm rebuild better-sqlite3`）、@juicesharp/rpiv-todo。TUI 依赖功能（overlay/交互确认）网页端不可用；中文使用文档在知识库（#PI 标签）
- 工作流「本机代码读取」节点（kind `pi-code-reader`，分组 **PIAgent**）：纯读取器，唯一配置「文件/文件夹路径」（支持模板），经 client_call 浏览器中转调本机桥 `fs.readAny`，内容原样传下游；令牌留空复用 localStorage `local-bridge-token`
- 工作流「Unity 工具」节点（分组「外部工具」）：执行走浏览器中转——引擎 SSE 下发 `client_call`，浏览器调本机 Bridge 后 POST `/api/workflows/client-result` 回传（`src/lib/client-calls.ts` 撮合，120s 超时）
- 数据隔离：**模型预设与知识库按 userId 隔离**；**工作流模板、提示词、自定义节点为登录用户共享**；全部接口要求登录
- 界面：浅色/深色双主题，`<html data-theme>` 驱动，设计令牌（`bg-canvas`/`bg-card`/`text-fg`/`text-muted`/`border-line`/`bg-accent` 等）定义在 `src/app/globals.css`；**新页面/组件一律用令牌类，不要写死 gray/neutral/white 色值**

## 关键文件

- `src/lib/db.ts` — SQLite 存储层（连接单例、幂等 DDL、旧 JSON 迁移）
- `src/lib/store.ts` / `auth.ts` — users/sessions 存储与会话校验
- `src/proxy.ts` — 路由拦截（见下方 Next 16 差异）
- `src/app/(main)/*` — 受保护页面（仪表盘、用户管理、workflows/knowledge/models/prompts/unity/tools/pi）
- `src/lib/pi-runner.ts` + `src/app/api/pi/chat/*` — Server-PIAgent 接口（仅 guowenyuan）
- `pi-service/` — PIAgent 独立服务（server.mjs、public/ 聊天网页、DEPLOY.md、独立 Dockerfile）
- `tools/local-bridge.mjs` + `src/app/api/local-bridge/*` — 本机桥及下载路由
- `src/lib/ai-tools.ts` / `usage-pages.ts` — AI 工具注册表 / 官方用量页映射
- `src/components/{Sidebar,Topbar,ThemeToggle}.tsx`、`src/components/workflow/*` — 布局与工作流组件
- `src/lib/client-calls.ts` — client_call 撮合表（globalThis 单例）
- `src/lib/{workflows-store,prompts-store,custom-nodes-store}.ts` — 共享存储；`{models-store,knowledge,kb-import}.ts` — 按 userId 隔离存储
- `src/lib/llm.ts` / `workflow-engine.ts` — LangChain 封装与工作流引擎

## Next 16 关键差异（踩过的坑）

- `middleware` 已废弃更名为 **proxy**（`src/proxy.ts` 导出 `proxy`，仅 Node runtime）；只做乐观检查，鉴权放页面/Handler 内；不做"已登录访问 /login 跳走"的反向重定向（避免失效 cookie 死循环）
- Async Request APIs：`cookies()` 必须 `await`；动态路由 `params` 是 Promise：`{ params: Promise<{ id: string }> }`
- eslint `react-hooks/set-state-in-effect` 会报"effect 中同步 setState"：首次挂载拉数据的惯用法用针对性 eslint-disable 注释处理
- `node:sqlite` 在 Node 24 免 flag 可用（ExperimentalWarning 正常）；类型需 @types/node ^24
- `next build` 数据收集阶段会执行 store 模块代码，首次 build 也会触发 db.ts 旧 JSON 迁移（幂等无害）

## 常见坑

- **非安全上下文**（http://裸IP）下 `crypto.randomUUID()` 不存在，前端一律用带 Math.random 兜底的 UUID 生成（PiPanel `newSessionId()` 模式）
- **PNA 误报**：浏览器私网访问保护可能拦截跨源到 127.0.0.1 的探测 fetch 造成 offline 误报——探测仅供参考不禁用按钮，iframe onLoad 才确认在线
- kimi web 默认端口 58627（旧文档 5494）；连接被拒绝先核对端口
- pi-service Dockerfile 若残留已删文件的 COPY 会 build 静默失败、容器跑旧代码
- Windows 上 `node_modules/.bin/<cmd>` 是 POSIX 脚本，spawn 会 ENOENT（.cmd 新版 Node 又禁直接 spawn）——一律 `spawn(process.execPath, [<包的 cli.js 路径>, ...])` 绕开 shim

## 维护约定

- **不要在本文件或任何提交中记录账号、密码、API Key 等敏感信息**
- 密码明文存储是客户明确需求（管理员需可见密码），属演示实现
- 改动功能时同步更新本文件的"功能与结构 / 关键文件"小节
- **PIAgent 子 agent 规范**：每个子 agent 须同时——① 实现本体（社区包 `pi install` 或自研扩展/桥命令）；② 注册为工作流节点（`nodeDefs.ts` 加 NodeKind + NODE_DEFS 条目 `group: "PIAgent"`，`workflow-engine.ts` 加 case）。PIAgent 分组节点仅 guowenyuan 可运行（运行路由按 group 自动拦截）
- 服务器常驻进程只有 Docker 容器（`sudo docker compose up -d`；裸机 `npx next start` 已弃用，部署改动=重新 build+up）；AI 工具运行在用户各自电脑

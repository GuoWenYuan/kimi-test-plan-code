<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 项目说明：个人工作站（后台管理 + workbench）

两套共存功能：**用户后台管理**（用户管理）与 **workbench 个人工作台**（Bento 首页、知识库、模型预设、提示词、电子宠物、Unity 控制、AI 工具），统一登录体系与布局。**仪表盘、工作流、Server-PIAgent 页已于 2026-08 移除**（含页面、API、引擎与存储代码；pi-service/pi-runner 仍保留供宠物对话使用）。

## 技术栈与命令

- Next.js 16（App Router，Turbopack）+ React 19 + TypeScript + Tailwind CSS 4
- 开发：`npm install` → `npm run dev`；生产：`npm run build && npm run start`（端口 3000）
- **Docker 部署（当前线上方式）**：`sudo docker compose build && sudo docker compose up -d`（docker 命令需 sudo）。四个服务：**workbench**（主应用，3000:3000，`./data:/app/data` 卷持久化 SQLite）、**pi-service**（仅 compose 内网，`./data/pi-agent:/data/pi-agent` 与 `./data/pets:/app/data/pets`（宠物工作区，路径须与 workbench 容器一致）卷）、**share**（nginx，`8300:80`，`./share:/usr/share/nginx/html:ro`）与 **frps**（远程设备穿透入口，7000 + 39100-39110，仅服务器有公网入口时启用，见下方「远程设备」）。pi-service 的 `npm ci` 需 `allow-remote all`（npm 12 拒绝 remote tgz 依赖）
- **8300 分享通道**：`./share/` 目录经 share 服务静态托管在 8300 端口，是给用户分发文件的固定通道（预览图、生成物等，直接放文件进 `share/` 即可，URL 为 `http://<工作站地址>:8300/<文件名>`；目录已 gitignore）
- `next build` 不内嵌 lint，需单独 `npm run lint`
- 存储：**SQLite 单文件**（Node 内置 `node:sqlite`），路径由 `DATABASE_PATH` 指定，默认 `data/app.db`（已 gitignore）。旧 JSON 一次性迁移在 `src/lib/db.ts`（导入后旧文件改名 `*.migrated.bak`）

## 功能与结构

- 认证：登录页 + HttpOnly session cookie；`/register` 公开注册（角色固定 `user`，注册成功自动登录）；角色 `super_admin` / `user`；**权限校验全部在服务端**（每个页面和 Route Handler 独立校验）
- 用户管理（仅 super_admin）：查看所有用户及明文密码、创建/删除（不能删自己）、改密码/角色

### workbench（所有登录用户可用）

- 首页 `/`：Bento 网格功能入口 hub（Dribbble 风格）：渐变主卡（宠物，展示我的宠物图）+ 知识库/模型/提示词/AI 工具/Unity 卡片，超管追加用户管理卡；`anim-card` 级联入场、`card-hover` 升起
- 知识库 `/knowledge`：Markdown 笔记、标签、图谱、文件上传转换（走 tools/ Python 管线）；接口双认证——session cookie 或 `Authorization: Bearer <个人 API 令牌>`（`auth.getApiUser`），`GET /api/knowledge?q=<词>&limit=` 为搜索入口
- 知识库 MCP（统一桥 `mcp` 子命令，`node workbench-bridge.mjs mcp`）：零依赖 stdio MCP server，env 注入 `WORKBENCH_URL`/`WORKBENCH_API_TOKEN`（或 bridge.json 的 workbench 段），提供 search/list/read_notes + list/read_prompts 五工具；令牌在知识库页「MCP 接入」区块获取/重置（`/api/api-token`）
- 生图 MCP `tools/image-mcp.mjs`：零依赖 stdio MCP server，调 RightAPI 生图模型（OpenAI Images API 兼容，`{baseUrl}/v1/images/generations`，按次计费），env 注入 `RIGHTAPI_API_KEY`（必填）/`RIGHTAPI_BASE_URL`（默认 https://www.rightapi.ai/draw）/`RIGHTAPI_MODEL`（默认 gpt-image-2）/`IMAGE_MCP_SAVE_DIR`；提供 generate_image + list_image_models。**独立分发，不走镜像；该平台不支持 `/v1/images/edits`（502），换表情靠固定角色描述+`background:"transparent"`**
- 电子宠物（黄色 yoyo 酱，AI 生成素材）：宠物池、PIAgent 对话、长期记忆、外观管理的全部细节见 **[PET.md](PET.md)**
- 模型预设 `/models`：name/model/baseUrl/apiKey，按 userId 隔离；「用量」= API 直查（`GET /api/models/[id]/usage`，`src/lib/usage-api.ts`，key 不出服务器）+ PIAgent 会话 token 统计（`src/lib/token-usage.ts`）+ iframe 内嵌官方控制台（`src/lib/usage-pages.ts` 映射，需 Chrome 扩展 **`frame-embed/`** 移除 X-Frame-Options/CSP，`GET /api/frame-embed` 下载）
- 提示词 `/prompts`：分组模板管理
- 快捷指令 `/commands`：保存预设 shell 指令（新增/编辑/删除，或 AI 生成：`POST /api/commands/generate` 让 PIAgent 按自然语言需求生成 name/command/timeout JSON 并直接入库，默认用用户首个模型预设），按 userId 隔离；目标二选一——「本机」= 浏览器直连统一桥的 `sys.run`（桥地址/令牌存 localStorage，需 `--allow-run`），「服务器」= workbench 容器内 shell（`POST /api/commands/[id]/run`，**仅 super_admin 可执行**，无命令白名单，输出截 50KB、超时上限 300s）
- AI 工具 `/tools`：外置 AI 网页工具入口（静态注册表 `src/lib/ai-tools.ts`）。**本机模式**：工具运行在用户自己电脑，浏览器直连 `127.0.0.1:<port>`；令牌存 localStorage（`#token=` 拼 URL），服务端不持有
- 远程设备（/tools 页「远程设备」区块）：手机等外端操作**其他机器**上 AI 工具的完整界面。frp 负责隧道（每台机器 frpc 把本机工具端口映射为 frps 独立端口；`frp/frps.toml`、`frp/frpc.example.toml`，搭建见 `docs/remote-devices.md`）；统一桥配置 `bridge.json` 的 `device` 段后每 30s 心跳上报设备名+工具清单+端口在线状态（`POST /api/devices/heartbeat`，Bearer 个人 API 令牌，同名 upsert，90s 无心跳判离线），devices 表按 userId 隔离（`src/lib/devices-store.ts`）
- 用量面板 Chrome 扩展 `usage-panel/`（`GET /api/usage-panel` 下载 zip）：在本机 AI 工具页注入右下角用量面板，数据源 `GET /api/usage/summary`（Bearer 令牌），background 代理 fetch 避免 CORS。**改完需重新打 zip（python zipfile）并重建镜像**
- Unity 控制 `/unity`：`unity-bridge/Editor/UnityBridge.cs` 放入 Unity 工程，127.0.0.1:39271 起 HTTP 服务，浏览器直连本机桥；`UnityBridge.Register()` 可扩展命令
- 统一本机桥 `tools/workbench-bridge.mjs`（`GET /api/bridge` 下载，旧 `/api/local-bridge`、`/api/device-agent`、`/api/knowledge-mcp` 入口均 302 至此）：一个零依赖脚本三合一——①默认本机 HTTP 桥（`node workbench-bridge.mjs --root <目录> [--allow-write] [--allow-run]`，仅监听 127.0.0.1、X-Bridge-Token 认证，只读 fs.* 默认开启，写与 sys.run 需 flag 门控；sys.run 输出在 Windows 下先试严格 UTF-8、失败回退 GBK 解码，修复中文控制台乱码）；②`bridge.json` 配 `device` 段即同进程跑远程设备心跳（`--no-serve` 可只跑心跳，兼容旧 `device-agent.json` 顶层结构）；③`mcp` 子命令 = 知识库/提示词 stdio MCP。统一配置 `bridge.json`（`--config` 指定），优先级 CLI flag > env > 配置 > 默认。**由镜像 COPY 提供，改后需重建镜像重下载**
- pi-service：pi CLI 封装服务（compose 内网 39273，`PI_SERVICE_TOKEN` 头校验），**现仅供电子宠物对话/任务使用**（`src/lib/pi-runner.ts`：spawn `pi --mode json --session-id <UUID>`，stdin 必须 ignore 否则挂起；**json 模式遇模型错误不改退出码，必须检查事件里 stopReason:"error"**；多轮靠同一 sessionId + 同一 cwd，pi 按 cwd 归档 session，卷持久化）。原 Server-PIAgent `/pi` 页与 `POST /api/pi/chat` 已随功能移除删除。pi-service 另内置聊天网页 + `DEPLOY.md` 供本机部署
- pi-service 社区包：`pi install npm:<pkg>`（需 `NPM_CONFIG_ALLOW_REMOTE=all`）装入 `data/pi-agent/npm/`；pi-hermes-memory 的 better-sqlite3 原生模块**必须在容器同 glibc 环境编译**（`docker run --rm -v .../data/pi-agent:/data -w /data/npm node:24-bookworm npm rebuild better-sqlite3`）；@narumitw/pi-goal ⚠️ 自主性强曾自行 git commit，慎用；TUI 依赖功能网页端不可用
- 数据隔离：**模型预设、知识库按 userId 隔离；电子宠物为全局宠物池（见 [PET.md](PET.md)）**；**提示词为登录用户共享**；全部接口要求登录
- 界面：**「青屿晨光」设计语言**（2026-08 二次重构）——浅色为第一公民（无偏好时默认 light），清晨青白底 + 青绿主色（`#0d9488`）+ 少量暖橙点缀（`--accent-2`，仅小面积使用），干净克制；暗色主题为「暮色港湾」（低对比柔和深青灰，非纯黑，保留 ThemeToggle 切换）。`<html data-theme>` 驱动双主题，设计令牌（`bg-canvas`/`bg-card`/`text-fg`/`text-muted`/`border-line`/`bg-accent` 等）定义在 `src/app/globals.css`；**新页面/组件一律用令牌类，不要写死 gray/neutral/white 色值**；语义色用 `text-danger`/`text-success`（`--danger`/`--success`）。核心工具类：`.bg-stage`（全站晨雾光斑背景层，`.bg-blob blob-mint/teal/aqua`，`(main)/layout.tsx` 与登录/注册页挂载，内容层需 z-10）、`.glass-card`（玻璃+内高光）、`.card-hover`（升起+柔光+描边泛主色）、`.bg-grad-accent`/`.anim-grad`/`.text-grad`/`.anim-shimmer`、`.btn-primary`（实心青绿）/`.btn-ghost`/`.input`/`.chip`（共享按钮/输入/徽章，新代码优先用）、`shadow-card`/`shadow-lift`、`anim-page`/`anim-card`/`anim-pop`。字体：自托管可变字体（`public/fonts/`，`next/font/local` 接线于 `src/app/layout.tsx`）——Syne 展示（`font-display`）、Manrope 正文（`font-sans`）、JetBrains Mono（`font-mono`）；改字体后需重建镜像
- 移动端适配：`<md` 小屏下 Sidebar 隐藏、改用 `MobileNav.tsx` 底部标签栏（前 4 项常驻 + 「更多」抽屉全量菜单，菜单配置与 Sidebar 共享自 `nav-items.tsx`）；顶栏 `ViewToggle.tsx`（仅小屏显示）一键切换手机/电脑版——电脑版=把 viewport meta 改为 `width=1100` 桌面布局缩放渲染，localStorage `view-mode` 持久化，首屏脚本在 `src/app/layout.tsx`；`viewportFit: "cover"` + `env(safe-area-inset-bottom)` 适配 iPhone 刘海/Home 条

## 关键文件

- `src/lib/db.ts` — SQLite 存储层（连接单例、幂等 DDL、旧 JSON 迁移）
- `src/lib/store.ts` / `auth.ts` — users/sessions/api_tokens 存储与会话校验（`getApiUser` 双认证）
- `src/lib/pet-*.ts` + `src/app/api/pets/*` + `src/components/pet/*` — 电子宠物（细节见 [PET.md](PET.md)）
- `tools/workbench-bridge.mjs` / `tools/image-mcp.mjs` — 本机运行的零依赖脚本（统一桥：本机 HTTP 桥 + 设备心跳 + 知识库 MCP；生图 MCP 独立分发）
- `src/proxy.ts` — 路由拦截（见下方 Next 16 差异）
- `src/app/(main)/*` — 受保护页面（Bento 首页、用户管理、knowledge/models/prompts/pets/unity/tools）
- `src/lib/pi-runner.ts` — pi-service 调用封装（宠物对话/任务在用）
- `pi-service/` — PIAgent 独立服务（server.mjs、public/ 聊天网页、DEPLOY.md、独立 Dockerfile）
- `src/lib/ai-tools.ts` / `usage-pages.ts` / `usage-api.ts` / `token-usage.ts` — AI 工具注册表 / 官方用量页映射 / 用量 API 直查 / PIAgent 会话 token 统计
- `src/lib/devices-store.ts` + `tools/workbench-bridge.mjs`（device 段）+ `frp/` — 远程设备注册表 / 设备心跳（统一桥）/ frp 穿透配置
- `usage-panel/` + `frame-embed/` — 两个 Chrome 扩展（用量面板、iframe 嵌入）
- `src/components/{Sidebar,Topbar,ThemeToggle,MobileNav,ViewToggle,nav-items}.tsx` — 布局组件
- `src/lib/prompts-store.ts` — 共享存储；`{models-store,knowledge,commands-store}.ts` — 按 userId 隔离存储
- `src/lib/llm.ts` — LangChain 封装（`testPreset` 供模型预设「测试连接」）
- `.kimi-code/skills/ui-ux-pro-max/` — UI/UX 设计智能 skill（上游 nextlevelbuilder/ui-ux-pro-max-skill v2.13.0）：SKILL.md + `scripts/search.py`（纯标准库，data 相对脚本定位）+ `data/*.csv`；做页面/组件设计时先用 `python3 .kimi-code/skills/ui-ux-pro-max/scripts/search.py "<关键词>" --design-system` 拿设计系统，再按需 `--domain` / `--stack nextjs` 细查

## Next 16 关键差异（踩过的坑）

- `middleware` 已废弃更名为 **proxy**（`src/proxy.ts` 导出 `proxy`，仅 Node runtime）；只做乐观检查，鉴权放页面/Handler 内；不做"已登录访问 /login 跳走"的反向重定向（避免失效 cookie 死循环）。**matcher 会拦截 `public/` 静态文件，未登录访问被 307 到 /login，属正常**
- Async Request APIs：`cookies()` 必须 `await`；动态路由 `params` 是 Promise：`{ params: Promise<{ id: string }> }`
- eslint `react-hooks/set-state-in-effect` 会报"effect 中同步 setState"：首次挂载拉数据的惯用法用针对性 eslint-disable 注释处理（注释放在被标记语句的上一行）
- `node:sqlite` 在 Node 24 免 flag 可用（ExperimentalWarning 正常）；类型需 @types/node ^24
- `next build` 数据收集阶段会执行 store 模块代码，首次 build 也会触发 db.ts 旧 JSON 迁移（幂等无害）

## 常见坑

- **非安全上下文**（http://裸IP）下 `crypto.randomUUID()` 不存在，前端一律用带 Math.random 兜底的 UUID 生成
- **PNA/LNA**：浏览器私网访问保护可能拦截跨源到 127.0.0.1 的探测 fetch 造成 offline 误报——探测仅供参考不禁用按钮，iframe onLoad 才确认在线。**Chrome 142+ 的 Local Network Access 会拦 iframe 内嵌本机工具（新标签打开不受限）**：ToolsPanel 的 iframe 已声明 `allow="local-network-access local-network loopback-network"`（145 起拆分 token），但用户仍需在浏览器授予「本地网络访问」权限（地址栏网站设置或 chrome://settings/content/localNetworkAccess）；kimi web 实测（0.35.0）不带 X-Frame-Options/CSP，与嵌入无关
- kimi web 默认端口 58627（旧文档 5494）；连接被拒绝先核对端口
- pi-service Dockerfile 若残留已删文件的 COPY 会 build 静默失败、容器跑旧代码
- Windows 上 `node_modules/.bin/<cmd>` 是 POSIX 脚本，spawn 会 ENOENT（.cmd 新版 Node 又禁直接 spawn）——一律 `spawn(process.execPath, [<包的 cli.js 路径>, ...])` 绕开 shim

## 维护约定

- **不要在本文件或任何提交中记录账号、密码、API Key 等敏感信息**
- 密码明文存储是客户明确需求（管理员需可见密码），属演示实现
- 改动功能时同步更新本文件的"功能与结构 / 关键文件"小节（宠物相关改动更新 [PET.md](PET.md)）
- 服务器常驻进程只有 Docker 容器（`sudo docker compose up -d`；裸机 `npx next start` 已弃用，部署改动=重新 build+up）；AI 工具运行在用户各自电脑

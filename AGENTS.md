<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 项目说明：个人工作站（原后台管理系统 + workbench）

本仓库为「个人工作站」，包含两套共存的功能：**用户后台管理**（用户管理）与恢复的 **workbench 个人工作台**（工作流、知识库、模型预设、提示词、自定义节点），统一在同一登录体系与同一布局下。

## 技术栈与命令

- Next.js 16（App Router，Turbopack）+ React 19 + TypeScript + Tailwind CSS 4
- `npm install` → `npm run dev`（开发）或 `npm run build && npm run start`（生产，端口 3000）
- `next build` 不再内嵌 lint，需单独运行 `npm run lint`
- 存储：**SQLite 单文件数据库**（Node 内置 `node:sqlite`，零原生依赖）。数据库路径由环境变量 `DATABASE_PATH` 指定，默认项目内 `data/app.db`（data/ 已被 .gitignore 忽略）。重新部署保留数据：把 `DATABASE_PATH` 指向项目外固定目录，或随部署携带 app.db 文件
- 旧 JSON 数据的一次性迁移在 `src/lib/db.ts`：首次连接时若 data/ 下存在旧 JSON 且对应表为空则自动导入，导入后旧文件改名为 `*.migrated.bak` 保留

## 功能与结构

- 认证：登录页 + HttpOnly session cookie；首次启动自动种子创建超级管理员（凭据不记录于此，由部署者持有）
- 注册：`/register` 公开注册页 + `POST /api/auth/register`，角色固定为普通用户 `user`，注册成功自动登录（写 session cookie）
- 角色：`super_admin` / `user`
- 用户管理（仅 super_admin）：按需求可查看所有用户账号及明文密码、创建/删除用户（不能删自己）、改密码/角色
- 权限校验全部在服务端（每个页面和 Route Handler 独立校验），不依赖前端隐藏

### workbench（所有登录用户可用）

- 工作流编辑器 `/workflows`：可视化编排、运行（SSE 流式）、AI 生成工作流、自定义节点；节点间数据为 JSON 值，下游可用 `{{input.字段}}` / `{{节点名.字段}}` 引用，节点可填「输入取值」只接收上游某个字段、「输入格式」声明本节点接受的格式（供「格式转换」节点读取并自动转换）
- 知识库 `/knowledge`：Markdown 笔记、标签、图谱、文件上传转换（doc/xmind 等走 tools/ Python 管线）
- 模型预设 `/models`：name/model/baseUrl/apiKey，支持测试连接；点预设卡片「用量」按平台映射（`src/lib/usage-pages.ts`，Right.codes→/dashboard、DeepSeek、Kimi Code→/code/console、Kimi 开放平台）iframe 内嵌官方控制台用量页（信息比 API 全，登录态用浏览器中的官方账号）；官方页面禁止跨源嵌入，配套自研 Chrome 扩展 **`frame-embed/`**（MV3 declarativeNetRequest，仅对 deepseek/kimi/moonshot/right.codes 域的 sub_frame 响应移除 X-Frame-Options 与 CSP、为 Set-Cookie 追加 SameSite=None;Secure 保登录态，图标点击 ON/OFF 切换），经 `GET /api/frame-embed` 下载 zip（需登录），未安装扩展则「新标签打开」兜底
- 提示词 `/prompts`：分组模板管理
- AI 工具 `/tools`：外置 AI 网页工具的统一入口（注册表 `src/lib/ai-tools.ts`，纯静态配置被客户端组件直接引用，无服务端接口；未来加 codex 等在数组追加即可）。**本机模式（类 Unity 桥接）**：工具运行在打开网页的用户自己电脑上，浏览器直连 `127.0.0.1:<port>`，不经过部署服务器——每个用户只能访问自己本机的环境，服务器上不跑共享实例。页面每 10s 用 no-cors fetch 探测本机工具是否在线（**注意**：浏览器私网访问保护 PNA 可能拦截跨源到 127.0.0.1 的探测造成 offline 误报，故探测仅供参考、不禁用按钮；iframe 加载成功才确认在线，已确认在线的不再自动重探），离线时展示启动命令（一键复制）与误报提示；支持 iframe 嵌入与新标签打开（回环模式下 kimi web 不下发 CSP，可直接嵌入）；令牌由用户在页面输入框自行填写（存浏览器 localStorage，作为 #token= 拼入 URL），服务端不持有任何工具令牌。首个接入工具 **Kimi Web UI**（`kimi web --port 5494 --keep-alive`，本机回环）。备用件：`tools/webui-proxy.mjs`（零依赖反代，剥 CSP frame-ancestors + WS 隧道）用于未来接入禁止跨源嵌入的工具，当前未运行。目前仅注册 web 类工具（Kimi Web UI）
- Unity 控制 `/unity`：通过本机桥接插件操控用户自己电脑上的 Unity Editor。Unity 侧把 `unity-bridge/Editor/UnityBridge.cs` 放入工程 `Assets/Editor/`，它在 127.0.0.1:39271 起极简 HTTP 服务（CORS 已处理），浏览器直接访问本机桥接口（不过部署服务器），命令经 `EditorApplication.update` 泵到 Unity 主线程执行；`UnityBridge.Register(name, desc, handler)` 可扩展自定义命令
- 工作流「Unity 工具」节点（节点面板分组「外部工具」）：配置时浏览器拉取本机 Bridge 指令列表供下拉选择；**执行走浏览器中转**——引擎（服务端）遇到 unity 节点时经 SSE 下发 `client_call`，浏览器 fetch 本机 Bridge 后 POST `/api/workflows/client-result` 回传（`src/lib/client-calls.ts` 按 callId 撮合，120s 超时），服务端无需也无法访问用户本机 Unity
- 数据隔离语义（沿用旧 workbench 设计）：**模型预设与知识库按 userId 隔离**（表内 user_id 列）；**工作流模板、提示词、自定义节点为登录用户共享**——均属个人数据，全部接口要求登录
- 界面：浅色/深色双主题，`<html data-theme>` 驱动（localStorage `theme` 持久化，默认跟随系统；根布局内联脚本防闪烁），设计令牌（`--canvas/--card/--subtle/--fg/--muted/--line/--accent` 等 CSS 变量映射为 `bg-canvas`、`bg-card`、`text-fg`、`text-muted`、`border-line`、`bg-accent` 等 Tailwind 类）定义在 `src/app/globals.css`；新页面/组件一律使用令牌类，不要再写死 gray/neutral/white 色值
- workbench 页面与后台管理共用 `src/app/(main)/layout.tsx` 布局与侧边栏；侧边栏按角色过滤"用户管理"

## 关键文件

- `src/lib/db.ts` — 统一 SQLite 存储层：连接单例、幂等 DDL、旧 JSON 一次性迁移
- `src/lib/store.ts` — users / sessions 存储（含种子逻辑）
- `src/lib/auth.ts` — 会话校验助手
- `src/proxy.ts` — 路由拦截（见下方 Next 16 差异）
- `src/app/api/auth/*` — 登录 / 退出 / 当前用户 / 注册（register 公开，角色固定 user）
- `src/app/api/users/*` — 用户管理接口（仅 super_admin）
- `src/app/(main)/*` — 受保护页面：仪表盘、用户管理、workflows / knowledge / models / prompts / unity / tools
- `src/lib/ai-tools.ts` — AI 工具注册表（/tools 页数据源，客户端直接引用，无服务端接口）
- `tools/webui-proxy.mjs` — 本机 Web UI 反代（剥 frame-ancestors、WS 隧道），供 iframe 嵌入用
- `src/lib/usage-pages.ts` — 各平台官方用量页映射（/models 页内嵌用，客户端安全）
- `src/app/login/*` / `src/app/register/*` — 登录页 / 注册页（proxy 对两者放行，页内做强校验跳转）
- `src/components/Sidebar.tsx` / `Topbar.tsx` / `ThemeToggle.tsx` — 后台布局组件与主题切换（workbench 页面复用，勿恢复旧 `components/layout/`）
- `src/components/workflow/*` — 工作流编辑器组件
- `src/lib/client-calls.ts` — 浏览器回调（client_call）撮合表（globalThis 单例，供 run / client-result 两个路由共享）
- `src/lib/workflows-store.ts` / `prompts-store.ts` / `custom-nodes-store.ts` — 共享数据存储
- `src/lib/models-store.ts` / `knowledge.ts` / `kb-import.ts` — 按 userId 隔离的存储与知识库导入
- `src/lib/llm.ts` / `workflow-engine.ts` — LangChain 模型封装与工作流执行引擎
- `src/app/api/{workflows,knowledge,models,prompts,custom-nodes}/*` — workbench 接口，均需登录
- `src/app/api/unity-bridge/*` — Unity Bridge 插件源码下载（需登录）

## Next 16 关键差异（踩过的坑）

- `middleware` 已废弃，更名为 **proxy**：文件为 `src/proxy.ts`，导出 `proxy`，仅 Node runtime；文档建议只做乐观检查，真正鉴权放在页面/Handler 内（本项目即如此）。proxy 不做"已登录访问 /login 跳走"的反向重定向（避免失效 cookie 死循环），由登录页服务端强校验处理
- Async Request APIs：`cookies()` 必须 `await`（写 cookie 也是）；动态路由 `params` 是 Promise，类型为 `{ params: Promise<{ id: string }> }`
- eslint-config-next 16 的 `react-hooks/set-state-in-effect` 会报"effect 中同步 setState"错误：对首次挂载拉取数据的惯用法（effect 里调用 async load），目前用针对性 eslint-disable 注释处理
- Windows 下 `TaskStop`/结束 npm 进程不会杀掉 `next start` 子进程，测试服务器需按端口 PID 手动 `taskkill`，否则下次启动 EADDRINUSE
- `node:sqlite` 在 Node 24 免 flag 可用（有 ExperimentalWarning 属正常）；类型需 @types/node ^24
- `next build` 的页面数据收集阶段会执行 store 模块代码：首次 build 也会触发 db.ts 的旧 JSON 迁移（迁移是幂等的一次性操作，无害，但别在 build 期间期待 data/ 保持原样）

## 维护约定

- **不要在本文件或任何提交中记录账号、密码、API Key 等敏感信息**（各 AI 工具的访问令牌由用户在 /tools 页自行填写并存于其浏览器 localStorage，不经过服务端）
- 密码明文存储是客户明确需求（管理员需可见密码），属演示实现；生产化应改为哈希存储
- 改动功能时同步更新本文件的"功能与结构 / 关键文件"小节
- 服务器常驻进程只有本系统：`npx next start -H 0.0.0.0 -p 3000`（重启后需手动拉起，无 systemd）；AI 工具（如 kimi web）运行在用户各自电脑，不在服务器部署

## 关键改动记录

- 2026-07-18：初始版本完成。替换原工作流示例应用，实现认证、用户管理、模型 API Key 管理（含管理员脱敏视图）；build / lint / curl 权限测试全部通过
- 2026-07-18：从 583dd9b 恢复 workbench（工作流/知识库/模型预设/提示词/自定义节点），与后台管理共存于 `(main)` 布局；恢复的 API 全部迁移到新 session 认证（`getSessionUser()`，未登录 401），保留原有 userId 隔离语义；旧 wb_session 签名 cookie、scrypt 哈希、注册接口未恢复；build / lint / curl 抽查（隔离、脱敏、后台回归）通过
- 2026-07-18：全部 JSON 存储迁移到 SQLite（新增 `src/lib/db.ts`，node:sqlite + `DATABASE_PATH` 环境变量）；知识库笔记从 .md 文件改为表存储（foam 索引改由数据库回调喂数据）；实现旧 JSON 自动一次性迁移（导入后旧文件改名 .migrated.bak）；@types/node 升到 ^24 以获得 node:sqlite 类型；真实数据迁移、重启持久化、全新空库环境均经 curl 验证通过
- 2026-07-18：新增公开注册功能（`/register` 页 + `POST /api/auth/register`），角色固定为普通用户 `user`，注册成功自动登录；proxy 放行 `/register`，登录页加入口链接；build / lint / curl 验证（注册、重复用户名 409、自动登录、普通用户访问用户管理 403）通过
- 2026-07-18：新增 Unity 控制功能：Unity Editor 本地桥接插件 `unity-bridge/Editor/UnityBridge.cs`（TcpListener 极简 HTTP，127.0.0.1:39271，CORS + Private Network Access 头，命令注册表 + 主线程泵，内置 log/create_cube/list_root_objects/select_object 示例）+ 网页端 `/unity` 页面（连接本机桥、命令发现与执行、执行日志）；网页只与浏览器所在机器的 127.0.0.1 通信，无新增服务端接口；lint / build / curl 冒烟（未登录 307、登录后 200）通过，Unity 侧插件需在实际 Unity 工程中验证
- 2026-07-18：工作流新增「Unity 工具」节点（节点面板分组「外部工具」，NodeDef 新增 group 字段）：配置面板可拉取本机 Bridge 指令下拉选择、参数支持模板变量；执行采用浏览器中转（引擎 SSE 下发 client_call → 浏览器调本机 Bridge → `/api/workflows/client-result` 回传，`src/lib/client-calls.ts` 撮合）；lint / build 通过，用假 Bridge + 模拟浏览器脚本验证全链路（模板渲染、回传成功、未选指令报错）
- 2026-07-18：修复 Unity 工具节点"切走再点回指令列表消失"：根因是指令列表存在 ConfigPanel 组件内 state，面板随节点选择卸载即丢失（已保存的选中指令本身不丢，靠"桥端未找到"兜底 option 显示）；改为模块级 `unityCmdCache` 按桥地址缓存，面板重开时立即恢复列表，state 记录桥地址归属防止多 unity 节点串列表，读取失败不再清空已有列表；jsdom 最小复现验证修复前后行为，lint / build 通过
- 2026-07-19：工作流节点新增「输入取值」（config.inputPath）：节点可声明只接收上游数据中的某个字段（点路径，如 `name`、`items.0`、`节点名.result`），引擎在汇聚上游输出后按路径提取替换 input，取不到则该节点报错；配置面板对除开始节点外所有节点通用渲染该字段；修复 /unity 页连接失败时吞掉真实错误的问题（日志带原始错误信息）；lint / build / SSE 运行链路 curl 验证（单上游提取、多上游按节点名提取、坏路径报错）通过
- 2026-07-19：工作流节点新增「输出格式」（config.outputFormat = mixed/single + config.outputKey）：混合为原样输出全部内容（默认），单独则把输出包装为 `{ 变量名: 内容 }` 再传下游，配合「输入取值」或 `{{input.变量名}}` 引用；配置面板对除开始/结束节点外通用渲染；LLM 节点（含自定义 llm 模式）与 Unity 节点的 JSON 解析改为宽容提取（`parseJsonText`：整体解析失败时提取首个 {...}/[...] 块再解析，解决模型包 ```json 代码块导致下游取不到字段的问题）；lint / build / SSE 运行链路 curl 验证（single 包装+下游 inputPath 提取、mixed 原样透传、围栏/说明文字包裹的 JSON 提取）通过
- 2026-07-19：按用户要求撤掉「输出格式」（outputFormat/outputKey，不限制输出格式），改为「输入格式」声明 + 格式转换节点：每个节点（除 start）可填 config.inputFormat（本节点接受的数据格式说明/示例，纯声明不强制）；新增 convert「格式转换」节点（NodeKind + NODE_DEFS + 引擎 case）——读取下游节点的 inputFormat，选了模型则让大模型把上游输出转成该格式（专用转换提示词，只输出结果本身），不选模型则仅做 JSON 归一化透传（字符串经 parseJsonText 尝试结构化）；AI 生成工作流的系统提示词默认要求各节点填 inputFormat、llm 提示词约定输出格式（用户明确约定则以用户为准），并提示格式不一致时插入 convert 节点；lint / build / SSE 验证（大模型输出的 JSON 文本字符串 → convert 归一化 → 下游 inputPath 取到字段）通过
- 2026-07-19：Unity 工具节点「指令参数」留空时自动使用上游输出作为参数（字符串直传，非空对象 inline 成 JSON，数字/布尔转字符串，无上游数据则空参数），填了模板则仍按模板渲染——修复"转换节点已输出参数但 Unity 指令拿到空参数报找不到物体"的断点；lint / build / SSE 验证（留空直传 S、接开始节点空参数、{{input.name}} 模板兼容）通过
- 2026-07-19：格式转换节点兼容模型把 {"name":"值"} 输出成 name:值 纯文本的情况：输出为单行 `字段:值` 且该字段名出现在下游 inputFormat 声明中时，归一化为 JSON 对象（纯文本目标不误转）；转换提示词明确要求带字段名的目标格式必须输出合法 JSON 对象；「输入取值」取不到字段的报错附上游数据预览（前 100 字符）便于排查；lint / build / SSE 验证（name:S → {"name":"S"} → inputPath 取值、"时间: 12:00" 纯文本不误转、坏路径报错带预览）通过
- 2026-07-19：所有节点输出统一规范为 JSON 结构（`normalizeOutput`，在 outputs.set 前统一应用）：JSON 文本解析为对象/数组，纯文本包装 `{ text }`，数字/布尔包装 `{ value }`，空值归一 `{}`；Unity 节点参数留空时自动解包 `{ text }` 字段；格式转换节点对单字段 `{ text }` 输入先解包再做 kv 归一化/模型转换（否则 kv 规则够不到被包装的文本）；配置面板「输入取值」提示补说明；lint / build / SSE 验证（文本/数字/对象包装、inputPath text、unity 解包 {text}→args "S"、{text:"name:S"}→convert→{"name":"S"}、纯文本透传）通过
- 2026-07-20：移植 github.com/GuoWenYuan/my-llm-tool 的 api-balance-monitor 查询逻辑到 `src/lib/llm-usage.ts`（DeepSeek 余额、Kimi Code 订阅额度，按 baseUrl/apiKey 自动识别平台，不支持的平台给出明确提示），新增 `GET /api/usage`（需登录，响应不含 apiKey）；随后按用户要求移除「API Key 管理」模块（/keys 页面、/api/keys 接口、store.ts 的 Key 函数、db.ts 的 api_keys 表 DDL 与旧 JSON 迁移），Key 管理与用量显示统一收敛到「模型」页签：/api/usage 改读当前用户模型预设，/models 页每条预设卡片内嵌用量区块（provider 徽章、summary、额度进度条、明细/错误）并提供「刷新用量」；仪表盘「我的 API Key」计数改为「我的模型预设」；lint / build / curl 验证（/keys 与 /api/keys 404、/api/usage 未登录 401、真实 DeepSeek 预设查到余额 CNY 14.39、Kimi 识别与自定义 401 提示、未知平台提示）通过
- 2026-07-20：新增「AI 工具」`/tools` 页签并接入 Kimi Web UI（kimi 0.27.0）：kimi web 以回环 127.0.0.1:5494 + --keep-alive 常驻，新增 `tools/webui-proxy.mjs`（零依赖反代：剥 CSP frame-ancestors、Host 重写防 DNS-rebinding、WebSocket 走原始 TCP 隧道）在 5495 对外转发解决跨源 iframe 禁嵌问题；`src/lib/ai-tools.ts` 工具注册表（预留 codex 等扩展）+ `GET /api/tools`（TCP 探测在线状态、读取 `~/.kimi-code/server.token` 持久令牌，仅登录用户）；/tools 页按「当前网页主机名:5495」+#token 拼 URL，默认带 workDir 深链直达工程，支持 iframe 嵌入（自动选第一个在线工具）与新标签打开；实测网络模式 CSP 仅 --host 时下发、回环模式无 CSP（代理剥离为兜底）；lint / build / curl 验证（/api/tools 未登录 401、登录返回 online+token、/tools 200、代理 HTTP 200、WS 隧道收到上游 401 即隧道通畅）通过
- 2026-07-20：按用户反馈重构「AI 工具」为本机模式（用户仅能访问自己的环境，不能访问服务器）：停掉并移除服务器共享 kimi web 实例与 5495 代理进程，删除 `GET /api/tools`（服务端不再持有/分发 kimi server 令牌）；`src/lib/ai-tools.ts` 改为纯静态注册表（local/publicPort/tokenHash/startCommand 字段，客户端组件直接引用）；ToolsPanel 重写——浏览器每 10s no-cors 探测 127.0.0.1:5494（local 模式）判断在线，离线展示启动命令一键复制，令牌输入框存 localStorage 并以 #token= 拼入 URL，嵌入/新标签打开仅在探测在线时可用（修复旧版按钮指向服务器 5495 被防火墙拦截导致的无效点击）；tools/webui-proxy.mjs 保留为未来禁嵌工具的备用件（未运行）；lint / build / curl 验证（/api/tools 404、/tools 200）通过，本机探测与 iframe 嵌入需在用户实际浏览器环境验证
- 2026-07-20：修复 /tools 页「本机 kimi web 已运行但仍显示未检测到、按钮全灰」：根因是浏览器私网访问保护（PNA）拦截了页面（服务器 IP 源）到 127.0.0.1 的 no-cors 探测 fetch（kimi web 不返回 PNA 许可头），而直接导航/iframe 不受限——探测 offline 系误报；改为探测仅供参考不再禁用「嵌入打开/新标签打开」，iframe onLoad 才确认在线，自动重探跳过已确认在线的工具（防状态抖动），令牌输入框改为常显，离线提示补充误报说明；lint / build 通过，3000 已重启
- 2026-07-20：修复 /tools 页 iframe/探测 ERR_CONNECTION_REFUSED：根因是 kimi 0.27 的 `kimi web` 默认端口为 58627（旧文档为 5494），用户按默认端口运行而页面写死 5494；改为注册表默认端口 58627、启动命令 `kimi web --keep-alive`，页面新增「端口」输入框（存 localStorage `ai-tool-port-<id>`，修改即按新端口重探，iframe/新标签/探测统一使用），离线提示补充"连接被拒绝=端口无监听，核对实际端口"的排查说明；lint / build 通过，3000 已重启
- 2026-07-20：/tools 页体验优化：注册表新增 tokenCommand 字段（kimi 为 `kimi server rotate-token`），令牌框旁展示并可一键复制；嵌入区改为带工具栏的容器（显示工具名与地址），新增最大化（fixed inset-0 全屏覆盖，Esc 或按钮还原；切换会重载 iframe，kimi web 会话在其服务端保持不丢）；lint / build 通过，3000 已重启
- 2026-07-20：「AI 工具」接入 Codex CLI（自建极简桥方案，用户确认网页无法直接调本机命令行后选定）：新增 `tools/codex-bridge.mjs`（零依赖本机桥，127.0.0.1:39272，GET /health 探测 codex 版本、POST /exec 以 SSE 流式执行 `codex exec`（resume=true 时 `codex exec resume --last` 延续会话），CORS + Access-Control-Allow-Private-Network 头齐备，10 分钟超时、客户端断开即杀子进程、1MB 请求体上限）；注册表新增 kind（web/cli-bridge）与 bridgeDownload 字段及 codex 条目；新增 `GET /api/codex-bridge` 桥文件下载（需登录，仿 unity-bridge）；新增 `CodexChat.tsx` 内嵌聊天面板（消息流、工作目录与「延续上次会话」持久化、Enter 发送、停止按钮、SSE 缓冲解析）；ToolsPanel 按 kind 渲染 iframe 或聊天面板，cli-bridge 隐藏「新标签打开」、离线提示含下载链接；桥在服务器冒烟验证（health/preflight/SSE 错误兜底/404），lint / build 通过，3000 已重启；真实 codex 执行链路需在装了 Codex CLI 的用户本机验证
- 2026-07-20：应用户要求把 Codex 桥泛化并更名为「本机命令行工具」：删除 codex-bridge.mjs / /api/codex-bridge / CodexChat.tsx，新增 `tools/local-cli-bridge.mjs`（执行任意 shell 命令：Windows `cmd /d /s /v:on /c`、其他 `$SHELL -c`；命令尾附 `__LCWD__` 标记行更新会话 cwd 实现 cd 持久（sh 用 `exit $__ec`、cmd 用延迟扩展 `!errorlevel!` 保留真实退出码）；/exec 强制 X-Bridge-Token 认证（随机生成或 LOCAL_CLI_BRIDGE_TOKEN 环境变量），防任意网页跨源执行本机命令）、`/api/local-cli-bridge` 下载路由、`CliPanel.tsx` 终端风面板（深色输出区、令牌框、cwd 提示符、非零退出码提示）；注册表条目 id=local-cli；桥在 Linux 冒烟验证（health/401/流式输出/cd /tmp 持久/真实退出码 2 与 0），lint / build / curl（新下载 401/200、旧 codex 路由 404）通过，3000 已重启；Windows cmd 路径未实测
- 2026-07-20：用量展示改为内嵌官方控制台（用户认为优于 API 查询）：删除 `src/lib/llm-usage.ts` 与 `GET /api/usage`（API 用量查询整体下线，git 历史可查），新增 `src/lib/usage-pages.ts`（baseUrl/apiKey → 官方用量页映射：DeepSeek→platform.deepseek.com/usage，sk-kimi-/api.kimi.com/coding→www.kimi.com/code，moonshot→platform.kimi.com）；/models 页移除 API 用量区块与「刷新用量」，预设卡片新增「用量」按钮展开 540px iframe 内嵌官方页面（附新标签兜底与"需去除 X-Frame-Options 的 Chrome 扩展"提示）；lint / build / curl（/api/usage 404、/models 200）通过，3000 已重启；iframe 实际内嵌效果依赖用户浏览器扩展，未在服务器侧验证
- 2026-07-20：修复「本机命令行工具显示在线但 /exec Failed to fetch」：根因多为用户本机 39272 端口跑的是旧版 codex-bridge（预检未允许 X-Bridge-Token 头导致 POST 被浏览器拦截，而 no-cors 探测能通）；桥 /health 增加 name: "local-cli-bridge" 标识，CliPanel 挂载时校验——不可达/旧版桥分别给出醒目横幅提示，连接失败文案补充旧桥可能，空态提示补充交互式 TUI 程序不可用（需非交互形式如 codex exec）；lint / build 通过，3000 已重启
- 2026-07-20：修正 Kimi Code 官方用量页地址为 https://www.kimi.com/code/console（用户提供）；lint / build 通过，3000 已重启
- 2026-07-20：自研 Chrome 扩展「控制台内嵌助手」（`frame-embed/`，参考用户提供的 MV3 manifest）：manifest（declarativeNetRequest + storage + action）+ rules.json（规则1仅对 deepseek.com/kimi.com/kimi.ai/moonshot.cn 的 sub_frame 移除 x-frame-options/frame-options/CSP 及 report-only；规则2为 sub_frame 的 Set-Cookie 追加 `; SameSite=None; Secure` 解决 iframe 内第三方 Cookie 登录态丢失）+ service-worker.js（图标点击切换 ruleset ON/OFF，徽章显示状态）+ README（原理/安装/注意事项）；python zipfile 打包 frame-embed.zip（仓库根目录），新增 `GET /api/frame-embed` 下载（需登录）；/models 页用量区提示改为链接下载该扩展；JSON 合法性已校验，lint / build / curl（下载 401/200 application/zip）通过，3000 已重启；扩展实际去嵌效果需在用户 Chrome 安装后验证
- 2026-07-20：usage-pages 新增 Right.codes 映射（baseUrl 含 right.codes → https://www.right.codes/dashboard，用户提供）；frame-embed 扩展 host_permissions 与两条 DNR 规则的 requestDomains 同步加入 right.codes 并重新打包 zip（规则2 曾漏加已补）；README 域名清单同步；lint / build 通过，3000 已重启
- 2026-07-20：「AI 工具」新增 Codex UI（第三方 GUI 方案，用户反馈 codex exec 命令行方式控制 Codex 体验不佳）：注册表新增 codex-ui 条目（web 类、local 模式、默认端口 6009 dev 前端，生产构建为 6008，页面可改端口），startCommand 为 clone+install+dev 一键复制；Vite dev 默认不下发 XFO 可直接 iframe 嵌入，若遇限制可用 frame-embed 扩展或 webui-proxy；通用本机命令行桥（local-cli）保留；lint / build 通过，3000 已重启
- 2026-07-20：/models 页改左右主从布局（用户反馈 max-w-3xl 单栏下用量 iframe 太挤）：整页 flex 全宽充满高度，左列 w-96 可滚动（新增/编辑表单 + 紧凑预设卡片，按钮换行），右侧 flex-1 官方用量面板（选中卡片高亮描边，工具栏含预设名/provider/新标签/关闭，iframe flex-1 充满剩余高度，底部常驻扩展提示，空态为引导占位）；lg 以下断点上下堆叠；lint / build / curl（/models 200）通过，3000 已重启
- 2026-07-20：/tools 的 Codex 方案替换（用户认为 Codex-CLI-UI 用户少且停更）：删除 codex-ui 条目，新增两个成熟方案卡片——Vibe Kanban（推荐，27k+ stars 多 Agent 编排，`npx vibe-kanban --port 3001` 避开常见 3000 冲突；注意 Bloop 公司 2026-04 关停后转社区维护、云端功能下线但本地可用）与 T3 Code（基于官方 codex app-server JSON-RPC 协议，`npx t3` 端口 3773，架构正统但早期阶段）；官方 Codex 桌面端为 Electron 无法 iframe 嵌入故排除；自研完整 Codex UI（会话/审批/diff）性价比低未采纳；lint / build 通过，3000 已重启
- 2026-07-20：/tools 页排版优化（用户反馈上下排版工作区太小、左右排版亦不佳）：卡片区改为可收起——点「嵌入打开/打开面板」后自动收起为一行标签条（状态点+名称的 chip 可切换工具，右侧刷新/管理工具按钮），工作区占满剩余页面；展开态头部新增「收起面板」按钮；与既有全屏最大化形成两级空间调节；外圈 padding p-6→p-4；lint / build / curl（/tools 200）通过，3000 已重启
- 2026-07-20：T3 Code 卡片描述补充 pairing token 提示（用户嵌入打开后遇到一次性配对令牌页）：token 在 npx t3 终端输出的配对链接中，直接在嵌入页输入框粘贴（第三方 iframe 存储分区，勿在新标签配对后指望嵌入页共享）；lint / build 通过，3000 已重启
- 2026-07-20：T3 Code 配对流程优化（用户粘贴一次性 token 无效）：根因为 pairing token 一次性、点开过配对链接即被消费；注册表新增 path 字段（toolUrl 拼路径），t3-code 配置 path:"/pair" + tokenHash，卡片令牌框填入 token 后嵌入页直达 /pair#token=... 配对；描述补充一次性令牌说明（失效需重启 npx t3 拿新 token）；lint / build 通过，3000 已重启
- 2026-07-20：/tools 移除「本机命令行工具」「Vibe Kanban」「T3 Code」（用户自行另找 Codex 方案）：注册表仅留 Kimi Web UI；删除 tools/local-cli-bridge.mjs、/api/local-cli-bridge 路由、CliPanel.tsx 及注册表 kind/bridgeDownload 字段与 ToolsPanel 中全部 cli-bridge 分支（按钮文案、条件渲染、离线下载提示）；lint / build / curl（/tools 200、/api/local-cli-bridge 404）通过，3000 已重启
- 2026-07-20：/tools 内嵌区铺满优化（用户反馈 kimi web 内容两边被截）：收起态下嵌入区工具栏与标签条合并为一行（最大化按钮移入标签条），iframe 无边框无圆角无外边距铺满剩余区域；页面根容器去掉 p-4 改为分区自管 padding（标签条自带 px-3 py-1.5 + border-b，展开态管理与嵌入区各自加 m/p）；lint / build / curl（/tools 200）通过，3000 已重启
- 2026-07-21：系统改名「个人工作站」+ 界面全面优化 + 浅色/深色双主题：`src/app/globals.css` 建立设计令牌体系（--canvas/--card/--subtle/--hover/--fg/--muted/--line/--accent 等 CSS 变量，@theme inline 映射为 bg-canvas/bg-card/text-fg/text-muted/border-line/bg-accent 等 Tailwind 类，@custom-variant 使 dark: 变体基于 [data-theme]）；根布局注入内联脚本按 localStorage `theme` / 系统偏好设置 data-theme 防闪烁，新增 `ThemeToggle.tsx`（顶栏太阳/月亮切换）；全部页面与工作流组件的写死 gray/neutral/white/blue 色值替换为令牌类（彩色状态徽章追加 dark: 变体），统一卡片（rounded-xl border-line bg-card shadow-sm）、输入框（focus:border-accent + ring-accent/25）、主/次按钮规范；侧边栏改图标导航 + accent 选中态，顶栏加主题切换与用户头像；tsc / lint / build 通过，3000 已重启

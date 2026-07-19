<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 项目说明：后台管理系统 + workbench

本仓库包含两套共存的功能：**后台管理系统**（用户/Key 管理）与恢复的 **workbench 个人工作台**（工作流、知识库、模型预设、提示词、自定义节点），统一在同一登录体系与同一布局下。

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
- 模型 API Key 管理：
  - 用户管理自己的 Key（name / baseUrl / apiKey），可见完整 apiKey
  - super_admin 可查看所有用户的 Key，但服务端响应**不组装 apiKey 字段**，仅返回 name + baseUrl
  - Key 的编辑/删除仅限所有者本人
- 权限校验全部在服务端（每个页面和 Route Handler 独立校验），不依赖前端隐藏

### workbench（所有登录用户可用）

- 工作流编辑器 `/workflows`：可视化编排、运行（SSE 流式）、AI 生成工作流、自定义节点；节点间数据为 JSON 值，下游可用 `{{input.字段}}` / `{{节点名.字段}}` 引用，节点可填「输入取值」只接收上游某个字段、「输入格式」声明本节点接受的格式（供「格式转换」节点读取并自动转换）
- 知识库 `/knowledge`：Markdown 笔记、标签、图谱、文件上传转换（doc/xmind 等走 tools/ Python 管线）
- 模型预设 `/models`：name/model/baseUrl/apiKey，支持测试连接
- 提示词 `/prompts`：分组模板管理
- Unity 控制 `/unity`：通过本机桥接插件操控用户自己电脑上的 Unity Editor。Unity 侧把 `unity-bridge/Editor/UnityBridge.cs` 放入工程 `Assets/Editor/`，它在 127.0.0.1:39271 起极简 HTTP 服务（CORS 已处理），浏览器直接访问本机桥接口（不过部署服务器），命令经 `EditorApplication.update` 泵到 Unity 主线程执行；`UnityBridge.Register(name, desc, handler)` 可扩展自定义命令
- 工作流「Unity 工具」节点（节点面板分组「外部工具」）：配置时浏览器拉取本机 Bridge 指令列表供下拉选择；**执行走浏览器中转**——引擎（服务端）遇到 unity 节点时经 SSE 下发 `client_call`，浏览器 fetch 本机 Bridge 后 POST `/api/workflows/client-result` 回传（`src/lib/client-calls.ts` 按 callId 撮合，120s 超时），服务端无需也无法访问用户本机 Unity
- 数据隔离语义（沿用旧 workbench 设计）：**模型预设与知识库按 userId 隔离**（表内 user_id 列）；**工作流模板、提示词、自定义节点为登录用户共享**——均属个人数据，全部接口要求登录
- workbench 页面与后台管理共用 `src/app/(main)/layout.tsx` 布局与侧边栏；侧边栏按角色过滤"用户管理"

## 关键文件

- `src/lib/db.ts` — 统一 SQLite 存储层：连接单例、幂等 DDL、旧 JSON 一次性迁移
- `src/lib/store.ts` — users / api_keys / sessions 存储（含种子逻辑）
- `src/lib/auth.ts` — 会话校验助手
- `src/proxy.ts` — 路由拦截（见下方 Next 16 差异）
- `src/app/api/auth/*` — 登录 / 退出 / 当前用户 / 注册（register 公开，角色固定 user）
- `src/app/api/users/*` — 用户管理接口（仅 super_admin）
- `src/app/api/keys/*` — API Key 接口（`?all=true` 为管理员只读视图，剔除 apiKey）
- `src/app/(main)/*` — 受保护页面：仪表盘、用户管理、Key 管理、workflows / knowledge / models / prompts
- `src/app/login/*` / `src/app/register/*` — 登录页 / 注册页（proxy 对两者放行，页内做强校验跳转）
- `src/components/Sidebar.tsx` / `Topbar.tsx` — 后台布局组件（workbench 页面复用，勿恢复旧 `components/layout/`）
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

- **不要在本文件或任何提交中记录账号、密码、API Key 等敏感信息**
- 密码明文存储是客户明确需求（管理员需可见密码），属演示实现；生产化应改为哈希存储
- 改动功能时同步更新本文件的"功能与结构 / 关键文件"小节

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

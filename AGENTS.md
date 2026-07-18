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

- 工作流编辑器 `/workflows`：可视化编排、运行（SSE 流式）、AI 生成工作流、自定义节点
- 知识库 `/knowledge`：Markdown 笔记、标签、图谱、文件上传转换（doc/xmind 等走 tools/ Python 管线）
- 模型预设 `/models`：name/model/baseUrl/apiKey，支持测试连接
- 提示词 `/prompts`：分组模板管理
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
- `src/lib/workflows-store.ts` / `prompts-store.ts` / `custom-nodes-store.ts` — 共享数据存储
- `src/lib/models-store.ts` / `knowledge.ts` / `kb-import.ts` — 按 userId 隔离的存储与知识库导入
- `src/lib/llm.ts` / `workflow-engine.ts` — LangChain 模型封装与工作流执行引擎
- `src/app/api/{workflows,knowledge,models,prompts,custom-nodes}/*` — workbench 接口，均需登录

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

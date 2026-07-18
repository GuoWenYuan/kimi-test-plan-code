<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 项目说明：后台管理系统

本仓库当前实现的是一个后台管理系统（在原有 workbench 脚手架基础上重构，原工作流示例应用已被替换删除）。

## 技术栈与命令

- Next.js 16（App Router，Turbopack）+ React 19 + TypeScript + Tailwind CSS 4
- `npm install` → `npm run dev`（开发）或 `npm run build && npm run start`（生产，端口 3000）
- `next build` 不再内嵌 lint，需单独运行 `npm run lint`
- 存储：项目内 `data/` 目录的 JSON 文件（已被 .gitignore 忽略），无外部数据库

## 功能与结构

- 认证：登录页 + HttpOnly session cookie；首次启动自动种子创建超级管理员（凭据不记录于此，由部署者持有）
- 角色：`super_admin` / `user`
- 用户管理（仅 super_admin）：按需求可查看所有用户账号及明文密码、创建/删除用户（不能删自己）、改密码/角色
- 模型 API Key 管理：
  - 用户管理自己的 Key（name / baseUrl / apiKey），可见完整 apiKey
  - super_admin 可查看所有用户的 Key，但服务端响应**不组装 apiKey 字段**，仅返回 name + baseUrl
  - Key 的编辑/删除仅限所有者本人
- 权限校验全部在服务端（每个页面和 Route Handler 独立校验），不依赖前端隐藏

## 关键文件

- `src/lib/store.ts` — JSON 持久化层（users / api-keys / sessions），含种子逻辑
- `src/lib/auth.ts` — 会话校验助手
- `src/proxy.ts` — 路由拦截（见下方 Next 16 差异）
- `src/app/api/auth/*` — 登录 / 退出 / 当前用户
- `src/app/api/users/*` — 用户管理接口（仅 super_admin）
- `src/app/api/keys/*` — API Key 接口（`?all=true` 为管理员只读视图，剔除 apiKey）
- `src/app/(main)/*` — 受保护页面：仪表盘、用户管理、Key 管理
- `src/app/login/*` — 登录页

## Next 16 关键差异（踩过的坑）

- `middleware` 已废弃，更名为 **proxy**：文件为 `src/proxy.ts`，导出 `proxy`，仅 Node runtime；文档建议只做乐观检查，真正鉴权放在页面/Handler 内（本项目即如此）。proxy 不做"已登录访问 /login 跳走"的反向重定向（避免失效 cookie 死循环），由登录页服务端强校验处理
- Async Request APIs：`cookies()` 必须 `await`（写 cookie 也是）；动态路由 `params` 是 Promise，类型为 `{ params: Promise<{ id: string }> }`

## 维护约定

- **不要在本文件或任何提交中记录账号、密码、API Key 等敏感信息**
- 密码明文存储是客户明确需求（管理员需可见密码），属演示实现；生产化应改为哈希存储
- 改动功能时同步更新本文件的"功能与结构 / 关键文件"小节

## 关键改动记录

- 2026-07-18：初始版本完成。替换原工作流示例应用，实现认证、用户管理、模型 API Key 管理（含管理员脱敏视图）；build / lint / curl 权限测试全部通过

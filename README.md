# kimi-test-plan-code

个人工作台：用于沉淀工作流与知识库，可持续积累、远程部署。

技术栈：Next.js (App Router) + TypeScript + Tailwind CSS。

## 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 页面结构

- `/` 工作台：概览卡片（最近工作流、知识库速览、快捷操作）
- `/workflows` 工作流：沉淀可复用工作流程（占位）
- `/knowledge` 知识库：沉淀经验与笔记（占位）

布局：左侧模块导航 + 顶栏（全局搜索、用户区）+ 主内容区。

## 构建与远程部署

```bash
npm run build
```

已配置 `output: "standalone"`，构建产物在 `.next/standalone`，部署到服务器：

```bash
# 将 .next/standalone、.next/static、public 上传到服务器后
node .next/standalone/server.js
```

`.next/static` 需复制到 `.next/standalone/.next/static`，`public` 复制到 `.next/standalone/public`。默认监听 3000 端口，可用 `PORT` 环境变量修改。

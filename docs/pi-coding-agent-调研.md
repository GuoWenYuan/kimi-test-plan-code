# Pi（pi.dev）调研文档

> 调研时间：2026-07-21
> 资料来源：[pi.dev 官网](https://pi.dev/)、[官方文档](https://pi.dev/docs)、[GitHub badlogic/pi-mono](https://github.com/badlogic/pi-mono)、[npm @earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)

## 一句话结论

Pi 是一个**极简内核 + 高度可扩展的终端 AI 编码智能体（coding agent harness）**，TypeScript/Node.js 编写，MIT 开源。它故意不做全功能，而是提供一套"原语"（extensions / skills / prompt templates / themes / packages），让用户把 agent 改造成自己想要的样子。它是知名项目 **OpenClaw 的底层引擎**。

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 名称 | Pi Coding Agent |
| 官网 | https://pi.dev/ |
| 作者 | Mario Zechner（badlogic，libGDX 作者），现归 earendil-works 组织维护 |
| 仓库 | github.com/badlogic/pi-mono（pnpm monorepo） |
| 安装 | `npm install -g @earendil-works/pi-coding-agent`（旧包名 `@mariozechner/pi-coding-agent` 已弃用），或 `curl -fsSL https://pi.dev/install.sh \| sh` |
| 技术栈 | TypeScript 全栈、Node.js 运行时、MIT 协议 |
| 成本 | 工具本身免费开源；模型费用自理（API Key 或订阅 OAuth） |

## 设计哲学：Primitives, not features

Pi 与 Claude Code 等"开箱全配"的 agent 走相反路线：

- **核心刻意保持小**：默认只给模型 4 个工具——`read`、`write`、`edit`、`bash`
- **不内置** sub-agents、plan mode、MCP、权限门、沙箱等"重功能"
- 官方立场：这些功能"有很多种做法"，应由用户用扩展自己实现，或安装第三方 Pi 包，甚至**直接让 Pi 给自己写出来**（Pi 可以在运行时修改自身代码，`/reload` 后生效）
- 没有内置权限系统：默认以启动用户的权限运行；需要隔离时用容器化方案（Gondolin 扩展、Docker、OpenShell）

## 核心能力

### 1. 四种运行模式

- **Interactive**：完整 TUI 交互体验
- **Print/JSON**：`pi -p "query"` 用于脚本；`--mode json` 输出结构化事件流，适合管道集成
- **RPC**：stdin/stdout 上的 JSONL 协议，供非 Node 程序集成
- **SDK**：作为库嵌入自己的 Node 应用——OpenClaw 就是这么做的

### 2. 多模型、多供应商（15+）

Anthropic、OpenAI、Google、Azure、Bedrock、Mistral、Groq、Cerebras、xAI、Hugging Face、Kimi For Coding、MiniMax、NVIDIA、OpenRouter、Ollama、llama.cpp（本地）等。

- 认证方式：API Key（环境变量）或 OAuth 订阅登录（`/login`，支持 Claude 订阅、ChatGPT Plus/Pro Codex 订阅等，不额外花 API 费用）
- 会话中随时 `/model` 或 Ctrl+L 切换模型，Ctrl+P 在收藏间循环
- 可通过 `models.json` 或扩展添加自定义供应商/模型
- 支持 `--model sonnet:high` 思考等级简写、`--models` 限定可循环模型集

### 3. 树状会话历史（差异化亮点）

- 会话以**树**而非线性存储，单文件保存所有分支
- `/tree` 跳回任意历史节点继续对话（天然支持"后悔药"式分叉探索）
- 可按消息类型过滤、打书签
- `/export` 导出 HTML；`/share` 上传 GitHub Gist 生成可分享的渲染链接

### 4. 上下文工程（Context Engineering）

极简系统提示词 + 可编程上下文注入，是 Pi 的主打卖点：

- **AGENTS.md**：启动时从 `~/.pi/agent/`、父目录、当前目录逐层加载项目指令
- **SYSTEM.md**：按项目替换/追加默认系统提示词
- **Compaction**：接近上下文上限时自动压缩旧消息，且压缩策略完全可用扩展重写（按主题压缩、代码感知摘要、换摘要模型等）
- **Skills**：按需加载的能力包（指令+工具），渐进披露不破坏 prompt cache
- **Prompt templates**：Markdown 文件即提示词，输入 `/name` 展开
- **Dynamic context**：扩展可在每轮对话前注入消息、过滤历史、实现 RAG 或长期记忆

### 5. 交互体验

- **Steer / Follow-up**：agent 工作时可继续输入——Enter 发送引导消息（当前工具执行完后插入，打断剩余工具），Alt+Enter 排队等 agent 完成后再发
- 丰富的快捷键、可自定义键位（keybindings）、主题（内置+自定义 TUI 主题，热重载）
- `@文件` 语法直接把文件/图片带进消息；`--tools read,grep,find,ls` 可裁成只读模式

### 6. 扩展与包生态

- **Extensions**：TypeScript 模块，可访问工具、命令、快捷键、事件和完整 TUI 组件；官方给出 50+ 示例（sub-agents、plan mode、权限门、路径保护、SSH 执行、沙箱、MCP、状态栏等）
- **Pi packages**：把 extensions + skills + prompts + themes 打包，经 npm 或 git 分发：
  ```
  pi install npm:@foo/pi-tools
  pi install git:github.com/badlogic/pi-doom
  ```
  全局装到 `~/.pi/agent/`，`-l` 可装到项目本地 `.pi/`
- monorepo 内还有可独立使用的底层库：`pi-ai`（统一多供应商 LLM API）、`pi-agent-core`（agent 运行时）、`pi-tui`（终端 UI 库，差分渲染）；另有 `pi-chat` 做 Slack/聊天自动化

## 能做到什么（典型场景）

1. **日常终端编码助手**：读写改代码、跑命令、跑测试，和你习惯的 Claude Code / Codex CLI 同类
2. **多模型工作台**：同一会话内随时在 Claude / GPT / Gemini / Kimi / 本地 Ollama 模型间切换，适合比价、比质、降级兜底
3. **订阅套现**：用 `/login` 接 ChatGPT Plus/Pro（Codex 订阅）或 Claude 订阅，不付 API 费用跑 gpt-5.x-codex 等模型
4. **自定义 agent 研发基座**：要 sub-agents、plan mode、MCP？自己写扩展或装包，内核不挡路——适合研究和二次开发
5. **嵌入自己的产品**：SDK 模式把 agent 能力嵌进应用（OpenClaw 即实例）；RPC 模式接非 Node 系统
6. **脚本化/CI 集成**：`pi -p "..."` + JSON 事件流进管道；`cat README.md | pi -p "总结"` 这类用法
7. **会话分叉探索**：`/tree` 回到任意节点换思路重来，适合方案对比
8. **本地/离线模型**：Ollama、llama.cpp 路由（`/llama` 管理本地模型）
9. **社区玩法**：装第三方包（如在 agent 里跑 Doom 的 pi-doom）、发布自己的包；官方还鼓励开源工作者用 `pi-share-hf` 把会话数据发布到 Hugging Face 供研究

## 与其他工具对比

| 维度 | Pi | Claude Code | Codex CLI |
| --- | --- | --- | --- |
| 定位 | 极简 harness，自己组装 | 全功能开箱即用 | 全功能开箱即用 |
| 内核工具 | 4 个（read/write/edit/bash） | 18+ 内置工具 | 较多内置工具 |
| 模型 | 15+ 供应商任意切换 | 仅 Anthropic | 仅 OpenAI |
| sub-agents / plan mode | 不内置，靠扩展 | 内置 | 内置 |
| MCP | 不内置，可扩展实现 | 内置 | 内置 |
| 权限/沙箱 | 无内置，靠容器化 | 内置权限门 | 内置沙箱 |
| 可嵌入性 | SDK/RPC/JSON 一应俱全 | 有 SDK | 有 app-server 协议 |
| 定制深度 | 运行时自我修改 + 热重载 | hooks/settings 层面 | 配置层面 |

## 风险与注意事项

- **安全自负**：默认无权限门，模型可执行的命令等同于你的用户权限，生产/敏感环境务必容器化（官方文档提供 Gondolin/Docker/OpenShell 三种模式）
- **功能靠自己/社区**：不想折腾扩展的人会觉得"什么都没有"；生态包的维护质量参差
- **个人项目色彩**：核心由 Mario Zechner 主导，治理和长期维护依赖少数维护者（不过 MIT + monorepo 结构降低了锁定风险）
- **包名迁移**：npm 包已从 `@mariozechner/pi-coding-agent` 迁移到 `@earendil-works/pi-coding-agent`，旧教程里的命令需要替换
- 文档中提到支持 Kimi For Coding 供应商，与本工作站现有 Kimi 体系有潜在结合点

## 快速上手

```bash
npm install -g @earendil-works/pi-coding-agent
export ANTHROPIC_API_KEY=sk-ant-...   # 或进 TUI 后 /login 用订阅 OAuth
cd your-project
pi
```

非交互脚本：`pi -p "总结这个仓库"`；只读审查：`pi --tools read,grep,find,ls -p "Review the code"`。

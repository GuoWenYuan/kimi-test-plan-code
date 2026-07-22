/**
 * /pi 聊天命令面板数据：已装社区包的全部斜杠命令 + 中文用途。
 * 点击填入输入框后以消息形式发给主 agent 触发（无 TUI 环境下命令即消息）。
 * tuiOnly 标记依赖终端界面的命令（网页端不可交互，仅作展示提示）。
 */
export interface PiCommand {
  cmd: string;
  desc: string;
  /** 依赖 TUI 交互界面，网页端不可用 */
  tuiOnly?: boolean;
}

export interface PiCommandGroup {
  group: string;
  commands: PiCommand[];
}

export const PI_COMMAND_GROUPS: PiCommandGroup[] = [
  {
    group: "计划模式 pi-plan-mode",
    commands: [
      { cmd: "/plan", desc: "进入计划模式：只读探索并产出实施方案" },
      { cmd: "/plan show", desc: "查看已生成的计划" },
      { cmd: "/plan finalize", desc: "要求补完计划或追问最后一个问题" },
      { cmd: "/plan implement", desc: "确认计划，退出只读模式开始实施" },
      { cmd: "/plan exit", desc: "退出计划模式并丢弃计划" },
      { cmd: "/plan tools", desc: "选择计划模式可用工具", tuiOnly: true },
    ],
  },
  {
    group: "目标模式 pi-goal",
    commands: [
      { cmd: "/goal", desc: "目标模式：下达/查看目标，自动续跑直到完成（⚠️ 自主行动）" },
      { cmd: "/goal edit", desc: "修改目标文本，保留用量计数" },
      { cmd: "/goal pause", desc: "暂停当前目标" },
      { cmd: "/goal resume", desc: "恢复已暂停的目标" },
      { cmd: "/goal clear", desc: "清除当前目标" },
    ],
  },
  {
    group: "子代理 pi-subagents",
    commands: [
      { cmd: "/run", desc: "委派子 agent 执行，如 /run reviewer 审查改动" },
      { cmd: "/chain", desc: "链式执行多个子 agent，上游输出喂给下游" },
      { cmd: "/parallel", desc: "并行执行多个子 agent" },
      { cmd: "/run-chain", desc: "运行已保存的链式工作流" },
      { cmd: "/subagent-cost", desc: "查看子 agent 调用成本" },
      { cmd: "/subagents-doctor", desc: "自检子 agent 配置是否正确" },
      { cmd: "/subagents-models", desc: "查看/设置子 agent 使用的模型" },
      { cmd: "/subagents-fleet", desc: "查看后台子 agent 运行状态" },
      { cmd: "/subagents-stop", desc: "停止指定后台子 agent" },
      { cmd: "/subagents-watchdog", desc: "看门狗：监控卡死的子 agent" },
    ],
  },
  {
    group: "记忆 pi-hermes-memory",
    commands: [
      { cmd: "/memory-insights", desc: "查看全部记忆与用户画像" },
      { cmd: "/memory-consolidate", desc: "手动合并记忆腾出空间" },
      { cmd: "/memory-interview", desc: "问答式预填用户画像" },
      { cmd: "/memory-switch-project", desc: "查看各项目的记忆统计" },
      { cmd: "/memory-index-sessions", desc: "批量导入历史会话到搜索库" },
      { cmd: "/memory-sync-markdown", desc: "旧 Markdown 记忆回填搜索库" },
      { cmd: "/memory-preview-context", desc: "预览注入系统提示词的记忆策略" },
      { cmd: "/learn-memory-tool", desc: "教学：了解记忆工具的用法" },
      { cmd: "/memory-skills", desc: "技能管理器", tuiOnly: true },
    ],
  },
  {
    group: "联网 pi-web-access",
    commands: [
      { cmd: "/curator", desc: "设置搜索 curator 工作流（建议 auto-summary 或 off）" },
      { cmd: "/search", desc: "浏览本会话已存的搜索结果" },
      { cmd: "/google-account", desc: "查看 Gemini Web 登录账号" },
      { cmd: "/websearch", desc: "打开搜索 curator 面板", tuiOnly: true },
    ],
  },
  {
    group: "MCP pi-mcp-adapter",
    commands: [
      { cmd: "/mcp", desc: "MCP 服务器状态与工具总览" },
      { cmd: "/mcp tools", desc: "列出全部 MCP 工具" },
      { cmd: "/mcp reconnect", desc: "重连 MCP 服务器并刷新工具缓存" },
      { cmd: "/mcp logout", desc: "退出指定 MCP 服务器的 OAuth 登录" },
      { cmd: "/mcp setup", desc: "MCP 配置向导", tuiOnly: true },
      { cmd: "/mcp-auth", desc: "OAuth 授权选择器", tuiOnly: true },
    ],
  },
  {
    group: "待办 rpiv-todo",
    commands: [{ cmd: "/todos", desc: "查看当前待办清单" }],
  },
];

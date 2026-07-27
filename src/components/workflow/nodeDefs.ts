export type NodeKind =
  | "start"
  | "end"
  | "llm"
  | "code"
  | "plugin"
  | "knowledge"
  | "kbimport"
  | "custom"
  | "condition"
  | "convert"
  | "unity"
  | "pi-code-reader"
  | "pi-agent"
  | "pi-web-search"
  | "pi-sub-reviewer"
  | "pi-sub-scout"
  | "pi-sub-researcher"
  | "pi-sub-planner"
  | "pi-sub-oracle"
  | "pi-sub-worker"
  | "pi-sub-context-builder"
  | "pi-sub-delegate"
  | "pi-mcp"
  | "pi-memory"
  | "pi-plan";

export interface NodeDef {
  kind: NodeKind;
  title: string;
  icon: string;
  description: string;
  /** 头部主题色 */
  color: string;
  /** 是否可拖入画布新创建（开始/结束节点默认存在，不出现在添加面板） */
  creatable: boolean;
  /** 节点面板中的分组标签（如"外部工具"）；不设置则归入顶部基础节点 */
  group?: string;
  /** 配置面板字段 */
  fields: {
    key: string;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    /** model：渲染为模型预设下拉；select：渲染为固定选项下拉 */
    type?: "text" | "model" | "select";
    /** type 为 select 时的固定选项 */
    options?: { value: string; label: string }[];
  }[];
}

/** PIAgent 执行类节点的通用配置字段（指令 + 模型 + 执行位置 + 工作目录） */
const PI_EXEC_FIELDS: NodeDef["fields"] = [
  {
    key: "instruction",
    label: "指令",
    placeholder:
      "交给 PIAgent 的任务，可用 {{input}} / {{input.字段}} / {{节点名}} 引用上游数据；不写 {{input}} 时自动附加上游数据",
    multiline: true,
  },
  { key: "presetId", label: "模型", type: "model" },
  {
    key: "location",
    label: "执行位置",
    type: "select",
    options: [
      { value: "local", label: "本机（浏览器直连你电脑上的 pi-service）" },
      { value: "server", label: "服务器（仅管理员 guowenyuan 可运行）" },
    ],
  },
  {
    key: "token",
    label: "访问令牌（可选）",
    placeholder: "本机 pi-service 设了 PI_SERVICE_TOKEN 时填写；留空则不携带",
  },
  {
    key: "workDir",
    label: "工作目录（可选）",
    placeholder: "绝对路径；本机执行为你电脑上的路径，留空 = pi-service 启动目录",
  },
];

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  start: {
    kind: "start",
    title: "开始",
    icon: "▶️",
    description: "工作流的入口",
    color: "bg-emerald-500",
    creatable: false,
    fields: [
      { key: "inputs", label: "输入参数", placeholder: "如：user_input", multiline: true },
    ],
  },
  end: {
    kind: "end",
    title: "结束",
    icon: "⏹️",
    description: "工作流的出口",
    color: "bg-rose-500",
    creatable: false,
    fields: [
      { key: "output", label: "输出内容", placeholder: "如：{{input}} 或 {{节点名.field}}，留空则原样输出上游数据", multiline: true },
    ],
  },
  llm: {
    kind: "llm",
    title: "大模型",
    icon: "🤖",
    description: "调用大模型生成内容",
    color: "bg-blue-500",
    creatable: true,
    fields: [
      { key: "presetId", label: "模型", type: "model" },
      { key: "prompt", label: "提示词", placeholder: "可用 {{input}} / {{节点名}} / {{knowledge}}（全局知识库）引用数据；不写 {{input}} 时自动附加上游数据", multiline: true },
    ],
  },
  code: {
    kind: "code",
    title: "代码",
    icon: "💻",
    description: "执行一段自定义代码",
    color: "bg-violet-500",
    creatable: true,
    fields: [
      { key: "language", label: "语言", placeholder: "javascript" },
      { key: "code", label: "代码", placeholder: 'input / outputs 均为 JSON 值\n结果赋值给 output，如：\noutput = { summary: input.text.toUpperCase() }', multiline: true },
    ],
  },
  plugin: {
    kind: "plugin",
    title: "插件",
    icon: "🧩",
    description: "调用外部工具或 API",
    color: "bg-amber-500",
    creatable: true,
    fields: [
      { key: "plugin", label: "插件名称", placeholder: "如：web_search" },
      { key: "params", label: "调用参数", placeholder: "JSON 格式参数", multiline: true },
    ],
  },
  knowledge: {
    kind: "knowledge",
    title: "知识库",
    icon: "📚",
    description: "检索 Markdown 知识库内容",
    color: "bg-cyan-500",
    creatable: true,
    fields: [
      { key: "query", label: "检索词", placeholder: "搜索知识库（标题/标签/正文），可用 {{input}}；留空返回全部笔记" },
    ],
  },
  kbimport: {
    kind: "kbimport",
    title: "知识库导入",
    icon: "📥",
    description: "导入本地目录/文件到知识库",
    color: "bg-teal-500",
    creatable: true,
    fields: [
      { key: "path", label: "本地路径（必填）", placeholder: "目录或文件，如 E:\\master\\Assets\\..." },
      { key: "tag", label: "标签（必填）", placeholder: "如：PTSUnity" },
      { key: "subTag", label: "子标签（必填）", placeholder: "如：PTSStateMachine" },
      { key: "presetId", label: "模型（可选，选了则由大模型生成文档）", type: "model" },
    ],
  },
  custom: {
    kind: "custom",
    title: "自定义",
    icon: "✨",
    description: "AI 生成的自定义节点",
    color: "bg-fuchsia-500",
    creatable: false,
    fields: [],
  },
  condition: {
    kind: "condition",
    title: "条件",
    icon: "🔀",
    description: "按条件分支执行",
    color: "bg-orange-500",
    creatable: true,
    fields: [
      { key: "expression", label: "条件表达式", placeholder: 'input 为 JSON 值，如：input.score > 0.5', multiline: true },
    ],
  },
  convert: {
    kind: "convert",
    title: "格式转换",
    icon: "🔄",
    description: "把上游输出转换成下游节点声明的「输入格式」",
    color: "bg-pink-500",
    creatable: true,
    fields: [
      { key: "presetId", label: "模型（可选，不选则仅做 JSON 归一化透传）", type: "model" },
    ],
  },
  unity: {
    kind: "unity",
    title: "Unity 工具",
    icon: "🎮",
    description: "执行本机 Unity Bridge 指令",
    color: "bg-indigo-500",
    creatable: true,
    group: "外部工具",
    // 配置由 ConfigPanel 特判渲染（指令下拉需浏览器拉取本机 Bridge 的命令列表）
    fields: [],
  },
  // PIAgent 分组：pi-service / 本机桥的子 agent 节点（规范：所有 PIAgent 子 agent 都必须在此注册为节点；
  // 运行路由按 group 统一拦截：执行位置=服务器 的节点仅 super_admin guowenyuan 可运行，
  // 执行位置=本机（浏览器直连用户自己电脑）或无 location 配置的节点按各自规则——pi-code-reader 仍限 guowenyuan）
  "pi-code-reader": {
    kind: "pi-code-reader",
    title: "本机代码读取",
    icon: "📂",
    description: "PIAgent：读取你电脑上的文件/文件夹内容，原样固定输出给下游节点",
    color: "bg-slate-500",
    creatable: true,
    group: "PIAgent",
    fields: [
      // 只需路径：文件 → 内容；文件夹 → 目录树 + 各文件内容。桥地址默认 39275、令牌自动复用 Pi agent 页保存值
      { key: "path", label: "文件/文件夹路径", placeholder: "本机桥根目录下的路径，如 src/main.ts 或 src，可用 {{input.xxx}}" },
    ],
  },
  // PIAgent 执行类节点：输入=指令/上游输出，输出按下游节点的「输入格式」声明自动适配（无需格式转换节点），
  // 执行期间 pi 的 delta 实时流式显示在运行面板
  "pi-agent": {
    kind: "pi-agent",
    title: "PIAgent 执行",
    icon: "🦾",
    description: "PIAgent：通用执行节点，一条指令驱动 pi agent 完成任意任务（读写文件/执行命令/调用全部已装扩展）",
    color: "bg-slate-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-web-search": {
    kind: "pi-web-search",
    title: "PIAgent 网页搜索",
    icon: "🔎",
    description: "PIAgent：网页搜索/抓取（pi-web-access），联网检索并把结果整理给下游",
    color: "bg-sky-500",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  // pi-subagents 子代理：每个子代理一个独立节点，指令即委派给该子代理的任务
  "pi-sub-reviewer": {
    kind: "pi-sub-reviewer",
    title: "PIAgent 评审",
    icon: "🧐",
    description: "PIAgent：reviewer 子代理——代码 diff / 计划 / 方案评审，带证据输出结论",
    color: "bg-rose-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-scout": {
    kind: "pi-sub-scout",
    title: "PIAgent 侦察",
    icon: "🛰️",
    description: "PIAgent：scout 子代理——快速代码库侦察，返回压缩上下文供下游使用",
    color: "bg-teal-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-researcher": {
    kind: "pi-sub-researcher",
    title: "PIAgent 研究员",
    icon: "🔬",
    description: "PIAgent：researcher 子代理——自主联网检索、评估并综合成研究简报",
    color: "bg-cyan-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-planner": {
    kind: "pi-sub-planner",
    title: "PIAgent 规划",
    icon: "📐",
    description: "PIAgent：planner 子代理——把需求与代码上下文转成具体实施计划",
    color: "bg-indigo-500",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-oracle": {
    kind: "pi-sub-oracle",
    title: "PIAgent 裁决",
    icon: "🔮",
    description: "PIAgent：oracle 子代理——高上下文决策一致性审查，发现漂移与隐藏矛盾",
    color: "bg-violet-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-worker": {
    kind: "pi-sub-worker",
    title: "PIAgent 执行者",
    icon: "👷",
    description: "PIAgent：worker 子代理——按上下文与计划落地实施任务",
    color: "bg-orange-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-context-builder": {
    kind: "pi-sub-context-builder",
    title: "PIAgent 上下文构建",
    icon: "🧱",
    description: "PIAgent：context-builder 子代理——分析需求与代码库，生成结构化上下文交接材料",
    color: "bg-stone-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-sub-delegate": {
    kind: "pi-sub-delegate",
    title: "PIAgent 委派",
    icon: "📨",
    description: "PIAgent：delegate 子代理——轻量通用委派代理，行为接近主会话",
    color: "bg-emerald-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-mcp": {
    kind: "pi-mcp",
    title: "PIAgent MCP 工具",
    icon: "🔌",
    description: "PIAgent：MCP 工具调用（pi-mcp-adapter），按需发现并使用 .mcp.json 配置的 MCP 服务器",
    color: "bg-amber-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-memory": {
    kind: "pi-memory",
    title: "PIAgent 记忆",
    icon: "🧠",
    description: "PIAgent：持久记忆读写（pi-hermes-memory），跨会话检索/存入结构化记忆",
    color: "bg-lime-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
  "pi-plan": {
    kind: "pi-plan",
    title: "PIAgent 计划",
    icon: "🗺️",
    description: "PIAgent：只读规划（pi-plan-mode），对任务做调研并输出实施计划，不修改任何文件",
    color: "bg-indigo-600",
    creatable: true,
    group: "PIAgent",
    fields: PI_EXEC_FIELDS,
  },
};

export const CREATABLE_NODES = Object.values(NODE_DEFS).filter((d) => d.creatable);

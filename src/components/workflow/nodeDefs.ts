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
  | "unity";

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
    /** model：渲染为模型预设下拉选择 */
    type?: "text" | "model";
  }[];
}

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
};

export const CREATABLE_NODES = Object.values(NODE_DEFS).filter((d) => d.creatable);

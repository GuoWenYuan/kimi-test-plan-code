export type NodeKind =
  | "start"
  | "end"
  | "llm"
  | "code"
  | "plugin"
  | "knowledge"
  | "condition";

export interface NodeDef {
  kind: NodeKind;
  title: string;
  icon: string;
  description: string;
  /** 头部主题色 */
  color: string;
  /** 是否可拖入画布新创建（开始/结束节点默认存在，不出现在添加面板） */
  creatable: boolean;
  /** 配置面板字段 */
  fields: { key: string; label: string; placeholder?: string; multiline?: boolean }[];
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
      { key: "output", label: "输出内容", placeholder: "如：{{llm.output}}", multiline: true },
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
      { key: "model", label: "模型", placeholder: "如：kimi-k2" },
      { key: "prompt", label: "提示词", placeholder: "输入提示词，可用 {{变量}} 引用上游输出", multiline: true },
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
      { key: "language", label: "语言", placeholder: "javascript / python" },
      { key: "code", label: "代码", placeholder: "编写处理逻辑", multiline: true },
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
    description: "检索知识库内容",
    color: "bg-cyan-500",
    creatable: true,
    fields: [
      { key: "dataset", label: "知识库", placeholder: "选择要检索的知识库" },
      { key: "query", label: "检索内容", placeholder: "可用 {{变量}} 引用上游输出" },
    ],
  },
  condition: {
    kind: "condition",
    title: "条件",
    icon: "🔀",
    description: "按条件分支执行",
    color: "bg-orange-500",
    creatable: true,
    fields: [
      { key: "expression", label: "条件表达式", placeholder: "如：{{llm.score}} > 0.5", multiline: true },
    ],
  },
};

export const CREATABLE_NODES = Object.values(NODE_DEFS).filter((d) => d.creatable);

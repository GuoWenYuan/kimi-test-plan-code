import vm from "vm";
import { getPreset } from "./models-store";
import { createChatModel } from "./llm";
import type { NodeKind } from "@/components/workflow/nodeDefs";

export interface RunNode {
  id: string;
  data: { kind: NodeKind; label: string; config: Record<string, string> };
}

export interface RunEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export type NodeStatus = "success" | "error" | "skipped";

export interface NodeResult {
  status: NodeStatus;
  /** JSON 序列化后的节点输出（用于界面展示） */
  output?: string;
  error?: string;
}

export interface RunResponse {
  results: Record<string, NodeResult>;
  finalOutput?: string;
}

/** 节点间流转的数据统一为 JSON 值 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** 展示用序列化：对象/数组美化输出，其余转字符串 */
function serialize(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** 模板插值用序列化：对象/数组压缩成单行 JSON，字符串原样 */
function inline(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** 按 "a.b.c" 路径取值，取不到返回 undefined */
function drill(value: unknown, path: string[]): unknown {
  let cur = value;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * 模板变量替换，数据以 JSON 为基础：
 * - {{input}}        上游输出整体
 * - {{input.a.b}}    上游输出的字段
 * - {{节点名}}       指定节点输出整体
 * - {{节点名.a.b}}   指定节点输出的字段
 * - {{knowledge}}    工作流全局知识库整体
 * - {{knowledge.a}}  全局知识库的字段
 */
function renderTemplate(
  tpl: string,
  input: unknown,
  outputs: Map<string, unknown>,
  labels: Map<string, string>,
  knowledge: unknown
): string {
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (raw, expr: string) => {
    const [head, ...path] = expr.split(".").map((s: string) => s.trim());
    let base: unknown;
    if (head === "input") {
      base = input;
    } else if (head === "knowledge") {
      base = knowledge;
    } else {
      const id = labels.get(head);
      if (!id || !outputs.has(id)) return raw;
      base = outputs.get(id);
    }
    const value = path.length ? drill(base, path) : base;
    return value === undefined ? raw : inline(value);
  });
}

function topoSort(nodes: RunNode[], edges: RunEdge[]): RunNode[] {
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  const order: RunNode[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const e of edges.filter((e) => e.source === n.id)) {
      const d = (indeg.get(e.target) ?? 0) - 1;
      indeg.set(e.target, d);
      if (d === 0) queue.push(nodes.find((x) => x.id === e.target)!);
    }
  }
  if (order.length !== nodes.length) throw new Error("工作流存在环，无法执行");
  return order;
}

async function execLlm(node: RunNode, prompt: string): Promise<JsonValue> {
  const presetId = node.data.config.presetId;
  if (!presetId) throw new Error("未选择模型预设，请在节点配置中选择");
  const preset = await getPreset(presetId);
  if (!preset) throw new Error("所选模型预设不存在，可能已被删除");
  const model = createChatModel(preset);
  const res = await model.invoke(prompt);
  const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  // 模型若返回 JSON 文本则解析为结构化数据，便于下游取字段
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function execCode(
  code: string,
  input: unknown,
  outputs: Record<string, unknown>,
  knowledge: unknown
): unknown {
  const sandbox: Record<string, unknown> = { input, outputs, knowledge, result: undefined };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\n;result = (typeof output !== "undefined" ? output : result);`, sandbox, {
    timeout: 3000,
  });
  return sandbox.result;
}

/**
 * 执行工作流：从拓扑序依次执行节点，节点间数据统一为 JSON 值。
 * knowledgeRaw 为工作流全局知识库（JSON 文本或纯文本），注入到所有节点。
 * 条件节点按表达式结果只激活对应分支（sourceHandle = "true"/"false"），
 * 未被激活分支上的节点标记为 skipped。
 */
export async function runWorkflow(
  nodes: RunNode[],
  edges: RunEdge[],
  userInput: string,
  knowledgeRaw = ""
): Promise<RunResponse> {
  const results: Record<string, NodeResult> = {};
  const outputs = new Map<string, unknown>();
  const labels = new Map(nodes.map((n) => [n.data.label, n.id]));

  // 全局知识库：是 JSON 则解析为结构化数据，否则按纯文本
  let knowledge: unknown = "";
  if (knowledgeRaw.trim()) {
    try {
      knowledge = JSON.parse(knowledgeRaw);
    } catch {
      knowledge = knowledgeRaw;
    }
  }

  let order: RunNode[];
  try {
    order = topoSort(nodes, edges);
  } catch (e) {
    for (const n of nodes) results[n.id] = { status: "error", error: (e as Error).message };
    return { results };
  }

  const activeEdge = new Map<string, boolean>();
  const isActive = (nodeId: string) => {
    const incoming = edges.filter((e) => e.target === nodeId);
    if (incoming.length === 0) return true;
    return incoming.some((e) => activeEdge.get(`${e.source}->${e.target}:${e.sourceHandle ?? ""}`));
  };

  for (const node of order) {
    const { kind, config } = node.data;

    if (kind !== "start" && !isActive(node.id)) {
      results[node.id] = { status: "skipped" };
      continue;
    }

    // 汇聚上游输出：单上游直传其值；多上游合并为 { 节点名: 输出 }
    const upstream = edges
      .filter((e) => e.target === node.id)
      .filter((e) => outputs.has(e.source));
    let input: unknown;
    if (upstream.length === 0) {
      input = "";
    } else if (upstream.length === 1) {
      input = outputs.get(upstream[0].source);
    } else {
      const merged: Record<string, unknown> = {};
      for (const e of upstream) {
        merged[nodes.find((n) => n.id === e.source)?.data.label ?? e.source] = outputs.get(e.source);
      }
      input = merged;
    }

    try {
      let output: unknown;
      switch (kind) {
        case "start": {
          // 输入尝试解析为 JSON，否则包装为 { "text": ... }
          try {
            output = userInput.trim() ? (JSON.parse(userInput) as JsonValue) : {};
          } catch {
            output = { text: userInput };
          }
          break;
        }
        case "llm": {
          let prompt = renderTemplate(config.prompt ?? "", input, outputs, labels, knowledge);
          // 提示词未显式引用 {{input}} 时，自动附加上游数据，保证模型能看到
          if (!/\{\{\s*input/.test(config.prompt ?? "")) {
            prompt += `\n\n输入数据：${inline(input)}`;
          }
          output = await execLlm(node, prompt);
          break;
        }
        case "code":
          output = execCode(config.code ?? "", input, Object.fromEntries(outputs), knowledge);
          break;
        case "condition": {
          const expr = config.expression ?? "false";
          const sandbox: Record<string, unknown> = { input, outputs: Object.fromEntries(outputs), knowledge, result: false };
          vm.createContext(sandbox);
          vm.runInContext(`result = (${expr});`, sandbox, { timeout: 1000 });
          const branch = Boolean(sandbox.result);
          output = { branch: branch ? "true" : "false" };
          for (const e of edges.filter((e) => e.source === node.id)) {
            const handle = e.sourceHandle ?? "";
            activeEdge.set(
              `${e.source}->${e.target}:${handle}`,
              (handle === "true" && branch) || (handle === "false" && !branch)
            );
          }
          break;
        }
        case "plugin":
          output = {
            _placeholder: "插件节点暂为占位",
            plugin: config.plugin ?? null,
            params: config.params ?? null,
          };
          break;
        case "knowledge":
          // 输出工作流全局知识库，供下游直接使用
          output = knowledge;
          break;
        case "end":
          output = config.output
            ? renderTemplate(config.output, input, outputs, labels, knowledge)
            : input;
          break;
      }

      outputs.set(node.id, output);
      results[node.id] = { status: "success", output: serialize(output) };

      if (kind !== "condition") {
        for (const e of edges.filter((e) => e.source === node.id)) {
          activeEdge.set(`${e.source}->${e.target}:${e.sourceHandle ?? ""}`, true);
        }
      }
    } catch (e) {
      results[node.id] = { status: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  const endNode = nodes.find((n) => n.data.kind === "end");
  return {
    results,
    finalOutput: endNode && outputs.has(endNode.id) ? serialize(outputs.get(endNode.id)) : undefined,
  };
}

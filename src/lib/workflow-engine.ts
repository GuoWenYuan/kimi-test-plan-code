import vm from "vm";
import { getPreset } from "./models-store";
import { createChatModel } from "./llm";
import { searchKnowledge } from "./knowledge";
import { importToKnowledge } from "./kb-import";
import { getCustomNode } from "./custom-nodes-store";
import type { ClientCallPayload } from "./client-calls";
import type { NodeKind } from "@/components/workflow/nodeDefs";

/** 需要浏览器代为执行的调用（目标在浏览器本机，如 Unity Bridge），由运行路由实现 */
export type ClientCallHandler = (nodeId: string, label: string, payload: ClientCallPayload) => Promise<string>;

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

/** 运行过程事件（用于流式输出） */
export type RunEvent =
  | { type: "node_start"; nodeId: string; label: string }
  | { type: "node_delta"; nodeId: string; delta: string }
  | { type: "node_end"; nodeId: string; label: string; result: NodeResult }
  | { type: "client_call"; nodeId: string; label: string; callId: string; payload: ClientCallPayload }
  | { type: "done"; results: Record<string, NodeResult>; finalOutput?: string };

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

async function execLlm(
  userId: string,
  node: RunNode,
  prompt: string,
  onDelta?: (delta: string) => void
): Promise<JsonValue> {
  const presetId = node.data.config.presetId;
  if (!presetId) throw new Error("未选择模型预设，请在节点配置中选择");
  const preset = await getPreset(userId, presetId);
  if (!preset) throw new Error("所选模型预设不存在，可能已被删除");
  const model = createChatModel(preset);

  let text: string;
  if (onDelta) {
    // 流式输出：逐 token 回调
    text = "";
    const stream = await model.stream(prompt);
    for await (const chunk of stream) {
      const delta =
        typeof chunk.content === "string" ? chunk.content : JSON.stringify(chunk.content);
      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
    // 部分提供方不支持 SSE 流式（静默返回空），回退为一次性调用
    if (!text) {
      const res = await model.invoke(prompt);
      text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
      if (text) onDelta(text);
    }
  } else {
    const res = await model.invoke(prompt);
    text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  }

  return parseJsonText(text);
}

/**
 * 把模型输出的文本尽量解析为 JSON：
 * 先整体解析；失败则提取首个 {...} 或 [...] 块再解析（模型常包 ```json 代码块或说明文字）；
 * 都失败则返回原文本
 */
function parseJsonText(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch { /* 继续尝试提取 */ }
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (m) {
    try {
      return JSON.parse(m[0]) as JsonValue;
    } catch { /* 落到原文本 */ }
  }
  return text;
}

/**
 * 统一节点输出为 JSON 结构：字符串尽量解析为对象/数组，解析不了的纯文本包装为
 * { text: "..." }，数字/布尔包装为 { value: ... }，空值归一为 {}。
 * 下游因此总能按字段取值（如输入取值 text）。
 */
function normalizeOutput(v: unknown): JsonValue {
  if (typeof v === "string") {
    const parsed = parseJsonText(v);
    return typeof parsed === "string" ? { text: parsed } : normalizeOutput(parsed);
  }
  if (typeof v === "number" || typeof v === "boolean") return { value: v };
  if (v === null || v === undefined) return {};
  return v as JsonValue;
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
 * 执行工作流：从拓扑序依次执行节点，节点输出统一规范为 JSON 结构
 * （JSON 文本解析为对象/数组，纯文本包 { text }，数字/布尔包 { value }）。
 * 节点可配置 inputPath（输入取值），声明只接收上游数据中的某个字段（点路径）；
 * 节点可配置 inputFormat（输入格式），声明本节点接受的数据格式（说明或示例），
 * 供上游的 convert（格式转换）节点读取并据此转换数据。
 * knowledgeRaw 为工作流全局知识库（JSON 文本或纯文本），注入到所有节点。
 * 条件节点按表达式结果只激活对应分支（sourceHandle = "true"/"false"），
 * 未被激活分支上的节点标记为 skipped。
 */
export async function runWorkflow(
  nodes: RunNode[],
  edges: RunEdge[],
  userInput: string,
  knowledgeRaw = "",
  emit?: (e: RunEvent) => void,
  userId = "",
  onClientCall?: ClientCallHandler
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
      emit?.({ type: "node_end", nodeId: node.id, label: node.data.label, result: results[node.id] });
      continue;
    }

    emit?.({ type: "node_start", nodeId: node.id, label: node.data.label });

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
      // 输入取值（可选）：节点声明自己只接收上游数据中的某个字段，
      // 填了点路径（如 name、items.0、节点名.result）则 input 替换为提取出的值
      const inputPath = (config.inputPath ?? "").trim();
      if (inputPath) {
        const extracted = drill(input, inputPath.split(".").map((s) => s.trim()).filter(Boolean));
        if (extracted === undefined) {
          throw new Error(
            `输入取值「${inputPath}」在上游数据中不存在（上游数据：${inline(input).slice(0, 100) || "空"}）`
          );
        }
        input = extracted;
      }

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
          output = await execLlm(userId, node, prompt, (delta) =>
            emit?.({ type: "node_delta", nodeId: node.id, delta })
          );
          break;
        }
        case "code":
          output = execCode(config.code ?? "", input, Object.fromEntries(outputs), knowledge);
          break;
        case "convert": {
          // 格式转换：读取下游节点声明的「输入格式」（config.inputFormat），
          // 选了大模型则把上游输出转换成该格式；不选则仅做 JSON 归一化透传
          const targetFormat = edges
            .filter((e) => e.source === node.id)
            .map((e) => nodes.find((n) => n.id === e.target)?.data.config.inputFormat ?? "")
            .map((s) => s.trim())
            .find(Boolean) ?? "";
          // 上游纯文本已被全局规范包装为 { text }：单字段时先解包回文本，
          // 便于 kv 归一化与模型转换按原始内容处理
          let normalized: unknown = typeof input === "string" ? parseJsonText(input) : input;
          if (
            normalized && typeof normalized === "object" && !Array.isArray(normalized) &&
            Object.keys(normalized).length === 1 &&
            typeof (normalized as Record<string, unknown>).text === "string"
          ) {
            normalized = parseJsonText((normalized as Record<string, unknown>).text as string);
          }
          if (!config.presetId) {
            output = normalized;
          } else {
            const prompt = [
              "你是数据格式转换器。把【输入数据】转换为【目标格式】所描述的格式。",
              "只输出转换结果本身：不要解释、不要 Markdown 代码块、不要多余文字。",
              "若目标格式带有字段名（如 {\"name\":\"...\"} 或 name:物体名），输出必须是合法 JSON 对象（如 {\"name\":\"值\"}），不要输出 字段:值 这样的纯文本；若目标格式是纯文本，只输出该文本本身。",
              "",
              "【目标格式】",
              targetFormat || "（下游未声明输入格式，请在保持语义不变的前提下整理为结构清晰的 JSON）",
              "",
              "【输入数据】",
              inline(normalized),
            ].join("\n");
            output = await execLlm(userId, node, prompt, (delta) =>
              emit?.({ type: "node_delta", nodeId: node.id, delta })
            );
          }
          // 模型/上游有时把 {"name":"值"} 写成 name:值 纯文本：
          // 若目标格式声明了该字段名，归一化为 JSON 对象，便于下游按字段取值
          if (typeof output === "string") {
            const kv = output.trim().match(/^([^\s:："]{1,32})\s*[:：]\s*([\s\S]+)$/);
            if (kv && targetFormat.includes(kv[1])) output = { [kv[1]]: kv[2].trim() };
          }
          break;
        }
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
        case "knowledge": {
          // 检索知识库：query 支持模板变量；为空则返回全部笔记摘要
          const query = renderTemplate(config.query ?? "", input, outputs, labels, knowledge);
          const hits = await searchKnowledge(userId, query);
          output = hits;
          break;
        }
        case "kbimport": {
          // 导入本地目录/文件到知识库，标签与子标签为必填
          const targetPath = (config.path ?? "").trim();
          const tag = (config.tag ?? "").trim();
          const subTag = (config.subTag ?? "").trim();
          if (!targetPath) throw new Error("未填写本地路径");
          if (!tag) throw new Error("未填写标签（必填）");
          if (!subTag) throw new Error("未填写子标签（必填）");
          output = await importToKnowledge(userId, targetPath, tag, subTag, config.presetId || undefined);
          break;
        }
        case "unity": {
          // Unity 工具节点：指令在用户浏览器本机的 Unity Bridge 上，
          // 由运行路由把调用经 SSE 转交浏览器执行并回传结果
          const url = (config.bridgeUrl ?? "").trim() || "http://127.0.0.1:39271";
          const name = (config.command ?? "").trim();
          if (!name) throw new Error("未选择 Unity 指令，请在节点配置中读取本机指令并选择");
          const argsTpl = (config.args ?? "").trim();
          let args: string;
          if (argsTpl) {
            args = renderTemplate(config.args ?? "", input, outputs, labels, knowledge);
          } else if (typeof input === "string") {
            args = input; // 参数留空：上游输出（如格式转换节点的结果）直接作为指令参数
          } else if (input && typeof input === "object" && typeof (input as Record<string, unknown>).text === "string") {
            args = (input as Record<string, unknown>).text as string; // 规范输出的 { text } 自动解包
          } else if (input && typeof input === "object" && Object.keys(input).length > 0) {
            args = inline(input);
          } else if (typeof input === "number" || typeof input === "boolean") {
            args = String(input);
          } else {
            args = ""; // 无上游数据（如直接接开始节点）：不传参数
          }
          if (!onClientCall) throw new Error("当前运行方式不支持 Unity 节点");
          const text = await onClientCall(node.id, node.data.label, { url, name, args });
          // 桥端返回的是字符串结果；若为 JSON 文本则解析为结构化数据，便于下游取字段
          output = parseJsonText(text);
          break;
        }
        case "pi-code-reader": {
          // PIAgent 本机代码读取：读取本机文件/文件夹内容，固定输出原样传给下游。
          // 经 client_call 由浏览器中转到用户本机桥（仅 guowenyuan，运行路由已拦截）；
          // 桥地址默认 39275，令牌留空由浏览器自动复用 Pi agent 页保存值
          const targetPath = renderTemplate(config.path ?? "", input, outputs, labels, knowledge).trim();
          if (!targetPath) throw new Error("未填写文件/文件夹路径");
          if (!onClientCall) throw new Error("当前运行方式不支持本机代码读取节点（需要浏览器页面保持打开）");
          const bridgeUrl = (config.bridgeUrl ?? "").trim() || "http://127.0.0.1:39275";
          const token = (config.token ?? "").trim();
          output = await onClientCall(node.id, node.data.label, {
            url: bridgeUrl,
            name: "fs.readAny",
            args: JSON.stringify({ path: targetPath }),
            token,
          });
          break;
        }
        case "custom": {
          // AI 生成的自定义节点：llm 模式执行提示词，code 模式执行代码
          const def = await getCustomNode(config.customId ?? "");
          if (!def) throw new Error("自定义节点定义不存在，可能已被删除");
          if (def.mode === "llm") {
            let prompt = renderTemplate(def.content, input, outputs, labels, knowledge);
            if (!/\{\{\s*input/.test(def.content)) {
              prompt += `\n\n输入数据：${inline(input)}`;
            }
            output = await execLlm(userId, node, prompt, (delta) =>
              emit?.({ type: "node_delta", nodeId: node.id, delta })
            );
          } else {
            output = execCode(def.content, input, Object.fromEntries(outputs), knowledge);
          }
          break;
        }
        case "end":
          output = config.output
            ? renderTemplate(config.output, input, outputs, labels, knowledge)
            : input;
          break;
      }

      // 所有节点输出统一规范为 JSON 结构（纯文本包 { text }，数字/布尔包 { value }）
      output = normalizeOutput(output);

      outputs.set(node.id, output);
      results[node.id] = { status: "success", output: serialize(output) };
      emit?.({ type: "node_end", nodeId: node.id, label: node.data.label, result: results[node.id] });

      if (kind !== "condition") {
        for (const e of edges.filter((e) => e.source === node.id)) {
          activeEdge.set(`${e.source}->${e.target}:${e.sourceHandle ?? ""}`, true);
        }
      }
    } catch (e) {
      results[node.id] = { status: "error", error: e instanceof Error ? e.message : String(e) };
      emit?.({ type: "node_end", nodeId: node.id, label: node.data.label, result: results[node.id] });
    }
  }

  const endNode = nodes.find((n) => n.data.kind === "end");
  const response: RunResponse = {
    results,
    finalOutput: endNode && outputs.has(endNode.id) ? serialize(outputs.get(endNode.id)) : undefined,
  };
  emit?.({ type: "done", results, finalOutput: response.finalOutput });
  return response;
}

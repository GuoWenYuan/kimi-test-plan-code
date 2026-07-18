import { NextResponse } from "next/server";
import { getPreset } from "@/lib/models-store";
import { createChatModel } from "@/lib/llm";
import { getSessionUser } from "@/lib/auth";
import { NODE_DEFS, type NodeKind } from "@/components/workflow/nodeDefs";

const KIND_DESC = (Object.keys(NODE_DEFS) as NodeKind[])
  .map((k) => {
    const d = NODE_DEFS[k];
    const fields = d.fields.map((f) => `${f.key}${f.type === "model" ? "(模型预设ID，可留空)" : ""}`).join(",");
    return `- ${k}：${d.title}，${d.description}，config 字段：${fields || "无"}`;
  })
  .join("\n");

const SYSTEM_PROMPT = `你是工作流生成器。根据用户需求生成工作流 JSON，严格输出 JSON，不要输出任何其他文字。

可用节点类型：
${KIND_DESC}

输出格式（严格遵守）：
{
  "nodes": [{"id": "唯一ID", "kind": "类型", "label": "显示名", "x": 数字, "y": 数字, "config": {}}],
  "edges": [{"source": "源节点ID", "target": "目标节点ID", "sourceHandle": "可选"}]
}

规则：
- 必须恰好包含一个 start 节点和一个 end 节点，start 在左侧 (x≈80)，节点从左到右排布，x 间隔约 240
- 数据是 JSON 流转；llm 节点的 prompt 里可用 {{input}}、{{节点名}}、{{knowledge}} 引用数据
- condition 节点有两个分支：出边的 sourceHandle 填 "true" 或 "false"
- 所有边必须从 start 可达、最终汇聚到 end`;

interface GenNode {
  id: string;
  kind: string;
  label?: string;
  x?: number;
  y?: number;
  config?: Record<string, string>;
}

interface GenGraph {
  nodes: { id: string; type: "work"; position: { x: number; y: number }; data: object }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string }[];
}

/** 校验并规范化 LLM 输出，非法结构抛错 */
function sanitize(raw: unknown): GenGraph {
  const obj = raw as { nodes?: GenNode[]; edges?: { source: string; target: string; sourceHandle?: string }[] };
  if (!obj || !Array.isArray(obj.nodes) || obj.nodes.length === 0) {
    throw new Error("模型未返回有效的 nodes");
  }
  const kinds = new Set(Object.keys(NODE_DEFS));
  const ids = new Set<string>();
  const nodes = obj.nodes.map((n, i) => {
    if (!n.id || !kinds.has(n.kind)) throw new Error(`节点 ${n.id ?? i} 类型非法: ${n.kind}`);
    if (ids.has(n.id)) throw new Error(`节点 ID 重复: ${n.id}`);
    ids.add(n.id);
    return {
      id: String(n.id),
      type: "work" as const,
      position: { x: Number(n.x) || 80 + i * 240, y: Number(n.y) || 200 },
      data: {
        kind: n.kind,
        label: String(n.label || NODE_DEFS[n.kind as NodeKind].title),
        config: n.config && typeof n.config === "object" ? n.config : {},
      },
    };
  });
  if (![...ids].some((id) => nodes.find((n) => n.id === id)?.data.kind === "start")) {
    throw new Error("缺少 start 节点");
  }
  if (![...ids].some((id) => nodes.find((n) => n.id === id)?.data.kind === "end")) {
    throw new Error("缺少 end 节点");
  }
  const edges = (Array.isArray(obj.edges) ? obj.edges : [])
    .filter((e) => e && ids.has(e.source) && ids.has(e.target))
    .map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    }));
  return { nodes, edges };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { requirement, presetId } = body ?? {};
  if (!requirement || typeof requirement !== "string") {
    return NextResponse.json({ error: "请描述你的需求" }, { status: 400 });
  }
  if (!presetId) {
    return NextResponse.json({ error: "请选择模型预设" }, { status: 400 });
  }
  const preset = await getPreset(user.id, presetId);
  if (!preset) {
    return NextResponse.json({ error: "模型预设不存在" }, { status: 404 });
  }

  try {
    const model = createChatModel(preset);
    const res = await model.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `用户需求：${requirement}` },
    ]);
    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    // 提取 JSON（兼容 ```json 包裹）
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回中未找到 JSON");
    const graph = sanitize(JSON.parse(match[0]));
    return NextResponse.json({ graph });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

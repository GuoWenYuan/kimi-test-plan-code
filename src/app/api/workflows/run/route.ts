import { NextResponse } from "next/server";
import { runWorkflow, type RunEdge, type RunNode } from "@/lib/workflow-engine";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { nodes, edges, input } = body ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return NextResponse.json({ error: "nodes / edges 必须为数组" }, { status: 400 });
  }
  if (!nodes.some((n: RunNode) => n.data?.kind === "start")) {
    return NextResponse.json({ error: "缺少开始节点" }, { status: 400 });
  }
  try {
    const result = await runWorkflow(
      nodes as RunNode[],
      edges as RunEdge[],
      typeof input === "string" ? input : "",
      typeof body.knowledge === "string" ? body.knowledge : ""
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

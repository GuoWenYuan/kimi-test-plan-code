import { NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/lib/workflows-store";

export async function GET() {
  return NextResponse.json(await listWorkflows());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { name, graph } = body ?? {};
  if (!name || !graph || !Array.isArray(graph.nodes)) {
    return NextResponse.json({ error: "name 与 graph.nodes 为必填" }, { status: 400 });
  }
  const tpl = await createWorkflow(String(name), {
    nodes: graph.nodes,
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    knowledge: typeof graph.knowledge === "string" ? graph.knowledge : "",
  });
  return NextResponse.json(tpl, { status: 201 });
}

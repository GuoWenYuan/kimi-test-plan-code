import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createWorkflow, listWorkflows } from "@/lib/workflows-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(await listWorkflows());
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { name, graph } = body ?? {};
  if (!name || !graph || !Array.isArray(graph.nodes)) {
    return NextResponse.json({ error: "name 与 graph.nodes 为必填" }, { status: 400 });
  }
  const tpl = await createWorkflow(String(name), {
    nodes: graph.nodes,
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    knowledge: typeof graph.knowledge === "string" ? graph.knowledge : "",
  }, typeof body.tag === "string" && body.tag.trim() ? body.tag.trim() : undefined);
  return NextResponse.json(tpl, { status: 201 });
}

import { runWorkflow, type RunEdge, type RunEvent, type RunNode } from "@/lib/workflow-engine";

/**
 * 运行工作流：SSE 流式返回执行过程。
 * 事件：node_start / node_delta / node_end / done，格式为 SSE `data: <json>\n\n`
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { nodes, edges, input } = body ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return Response.json({ error: "nodes / edges 必须为数组" }, { status: 400 });
  }
  if (!nodes.some((n: RunNode) => n.data?.kind === "start")) {
    return Response.json({ error: "缺少开始节点" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const send = (e: RunEvent | { type: "fatal"; error: string }) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => {});

  runWorkflow(
    nodes as RunNode[],
    edges as RunEdge[],
    typeof input === "string" ? input : "",
    typeof body.knowledge === "string" ? body.knowledge : "",
    send
  )
    .catch((e) => send({ type: "fatal", error: e instanceof Error ? e.message : String(e) }))
    .finally(() => writer.close().catch(() => {}));

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

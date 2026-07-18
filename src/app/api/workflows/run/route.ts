import { runWorkflow, type RunEdge, type RunEvent, type RunNode } from "@/lib/workflow-engine";
import { createClientCall, type ClientCallPayload } from "@/lib/client-calls";
import { getSessionUser } from "@/lib/auth";

/**
 * 运行工作流：SSE 流式返回执行过程。
 * 事件：node_start / node_delta / node_end / done，格式为 SSE `data: <json>\n\n`
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
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

  // Unity 等"目标在浏览器本机"的节点：下发 client_call 事件，等浏览器回传结果
  const onClientCall = async (nodeId: string, label: string, payload: ClientCallPayload) => {
    const { callId, promise } = createClientCall();
    await send({ type: "client_call", nodeId, label, callId, payload });
    return promise;
  };

  runWorkflow(
    nodes as RunNode[],
    edges as RunEdge[],
    typeof input === "string" ? input : "",
    typeof body.knowledge === "string" ? body.knowledge : "",
    send,
    user.id,
    onClientCall
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

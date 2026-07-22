import { runWorkflow, type RunEdge, type RunEvent, type RunNode } from "@/lib/workflow-engine";
import { createClientCall, type ClientCallPayload } from "@/lib/client-calls";
import { getSessionUser } from "@/lib/auth";
import { NODE_DEFS } from "@/components/workflow/nodeDefs";

/** PIAgent 分组的节点 kind 集合（仅 super_admin guowenyuan 可执行；新增 PIAgent 节点自动纳入） */
const PIAGENT_KINDS = new Set(
  Object.values(NODE_DEFS).filter((d) => d.group === "PIAgent").map((d) => d.kind)
);

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
  // PIAgent 节点（pi-service 在服务器上以部署账号权限运行）仅 guowenyuan 可用
  if (
    !(user.role === "super_admin" && user.username === "guowenyuan") &&
    nodes.some((n: RunNode) => PIAGENT_KINDS.has(n.data?.kind))
  ) {
    return Response.json({ error: "PIAgent 节点仅管理员 guowenyuan 可用" }, { status: 403 });
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

import { runWorkflow, type RunEdge, type RunEvent, type RunNode } from "@/lib/workflow-engine";
import { createClientCall, type ClientCallPayload } from "@/lib/client-calls";
import { getSessionUser } from "@/lib/auth";
import { NODE_DEFS } from "@/components/workflow/nodeDefs";

/** PIAgent 分组的节点 kind 集合（新增 PIAgent 节点自动纳入） */
const PIAGENT_KINDS = new Set(
  Object.values(NODE_DEFS).filter((d) => d.group === "PIAgent").map((d) => d.kind)
);

/**
 * 带「执行位置」配置的 PIAgent 执行类节点：
 * 选服务器执行才要求 guowenyuan；本机执行 = 浏览器直连用户自己电脑的 pi-service
 * （与 local-bridge 同一安全模型，令牌用户自持），对所有登录用户开放
 */
const PI_EXEC_KINDS = new Set(["pi-agent", "pi-web-search", "pi-subagent", "pi-mcp", "pi-memory", "pi-plan"]);

/** 该节点是否需要服务器侧 pi 权限（仅 guowenyuan） */
function needsServerPi(n: RunNode): boolean {
  const kind = n.data?.kind;
  if (!PIAGENT_KINDS.has(kind)) return false;
  if (PI_EXEC_KINDS.has(kind)) return n.data?.config?.location === "server";
  return true; // pi-code-reader 等其余 PIAgent 节点保持仅 guowenyuan
}

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
  // 需要服务器侧 pi 的 PIAgent 节点（pi-service 在服务器上以部署账号权限运行）仅 guowenyuan 可用
  if (
    !(user.role === "super_admin" && user.username === "guowenyuan") &&
    nodes.some((n: RunNode) => needsServerPi(n))
  ) {
    return Response.json({ error: "服务器执行的 PIAgent 节点仅管理员 guowenyuan 可用（可改用「执行位置：本机」）" }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const send = (e: RunEvent | { type: "fatal"; error: string }) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => {});

  // 目标在浏览器本机的节点（Unity、本机 PIAgent 等）：下发 client_call 事件，等浏览器回传结果；
  // onProgress 接收浏览器经 /api/workflows/client-progress 回传的增量，转成 node_delta 流式显示
  const onClientCall = async (nodeId: string, label: string, payload: ClientCallPayload) => {
    const { callId, promise } = createClientCall(120_000, (delta) =>
      send({ type: "node_delta", nodeId, delta })
    );
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

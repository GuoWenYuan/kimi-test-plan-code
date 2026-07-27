import { reportClientCallProgress } from "@/lib/client-calls";
import { getSessionUser } from "@/lib/auth";

/**
 * POST /api/workflows/client-progress —— 浏览器执行 client_call 过程中的增量回传
 * （如本机 PIAgent 节点消费 pi-service SSE 时逐事件上报），
 * 与 /api/workflows/run 下发的 callId 撮合，转成运行流的 node_delta 事件。
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { callId, delta } = body ?? {};
  if (typeof callId !== "string" || !callId) {
    return Response.json({ error: "缺少 callId" }, { status: 400 });
  }

  const found = reportClientCallProgress(callId, typeof delta === "string" ? delta : "");
  if (!found) {
    return Response.json({ error: "callId 不存在或已超时" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

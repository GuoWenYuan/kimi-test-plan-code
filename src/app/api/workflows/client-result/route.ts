import { settleClientCall } from "@/lib/client-calls";
import { getSessionUser } from "@/lib/auth";

/**
 * POST /api/workflows/client-result —— 浏览器执行 client_call 后的结果回传。
 * 与 /api/workflows/run 下发的 callId 撮合，唤醒引擎中等待的节点。
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { callId, ok, result, error } = body ?? {};
  if (typeof callId !== "string" || !callId) {
    return Response.json({ error: "缺少 callId" }, { status: 400 });
  }

  const found = settleClientCall(
    callId,
    ok === true,
    ok === true ? String(result ?? "") : String(error ?? "浏览器侧执行失败")
  );
  if (!found) {
    return Response.json({ error: "callId 不存在或已超时" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

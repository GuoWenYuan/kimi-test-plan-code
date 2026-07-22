import { getSessionUser } from "@/lib/auth";
import { getPreset } from "@/lib/models-store";
import { runPiChat, type PiChatEvent } from "@/lib/pi-runner";

/**
 * Pi agent 对话（服务端执行本机 pi CLI，SSE 流式返回）。
 * 仅超级管理员 guowenyuan 可用——pi 在服务器上以部署账号权限执行命令，不对外开放。
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  if (user.role !== "super_admin" || user.username !== "guowenyuan") {
    return Response.json({ error: "无权限访问 Pi agent" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { message, presetId, sessionId } = body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "message 不能为空" }, { status: 400 });
  }
  if (typeof presetId !== "string" || !presetId) {
    return Response.json({ error: "缺少 presetId" }, { status: 400 });
  }
  // sessionId 由前端生成（UUID），同一 id 复用以延续多轮对话（pi 按 cwd 分组存 session）
  if (typeof sessionId !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) {
    return Response.json({ error: "sessionId 非法" }, { status: 400 });
  }
  const preset = await getPreset(user.id, presetId);
  if (!preset) return Response.json({ error: "模型预设不存在" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const send = (e: PiChatEvent) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => {});

  runPiChat({ preset, sessionId, message: message.trim(), send, signal: req.signal })
    .catch((e) => send({ type: "error", message: e instanceof Error ? e.message : String(e) }))
    .finally(() => writer.close().catch(() => {}));

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

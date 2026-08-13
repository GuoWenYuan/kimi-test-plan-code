import { getSessionUser } from "@/lib/auth";
import { getPreset } from "@/lib/models-store";
import { deletePiSessionFiles, runPetChat, type PetChatEvent } from "@/lib/pet-chat";
import { clearChatSession, getPetById } from "@/lib/pet-store";

/**
 * 宠物对话（SSE 流式）：仅宠物主人可用，模型用主人为宠物绑定的预设。
 * 人设 + 长期记忆在服务端注入；用户说"记住…"时自动精简入库并发 memory_saved 事件。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const result = getPetById(id);
  if (!result) return Response.json({ error: "宠物不存在" }, { status: 404 });
  const pet = result.pet;
  if (pet.ownerUserId !== user.id) {
    return Response.json({ error: "只能和自己的宠物对话" }, { status: 403 });
  }
  if (!pet.presetId) {
    return Response.json({ error: "还没有为宠物配置模型，请先在宠物设置里选择一个模型预设" }, { status: 400 });
  }
  const preset = await getPreset(user.id, pet.presetId);
  if (!preset) return Response.json({ error: "宠物绑定的模型预设已不存在，请重新配置" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  if (typeof body?.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "message 不能为空" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const send = (e: PetChatEvent) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => {});

  // SSE 心跳：工具执行等长静默期间每 10s 发注释行保活，
  // 防止中间层（代理/隧道）空闲断连导致前端收到空白回复
  const heartbeat = setInterval(() => {
    writer.write(encoder.encode(": ping\n\n")).catch(() => {});
  }, 10_000);

  runPetChat({ pet, preset, message: body.message.trim(), send, signal: req.signal })
    .catch((e) => send({ type: "error", message: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      clearInterval(heartbeat);
      writer.close().catch(() => {});
    });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * 清空对话历史（仅主人）：置空 chat_session_id（下次对话开新会话），
 * 并删除 pi-service 侧缓存的会话历史文件。
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const result = getPetById(id);
  if (!result) return Response.json({ error: "宠物不存在" }, { status: 404 });
  if (result.pet.ownerUserId !== user.id) {
    return Response.json({ error: "只能清空自己宠物的对话记录" }, { status: 403 });
  }

  const oldSessionId = clearChatSession(id);
  const removed = oldSessionId ? deletePiSessionFiles(oldSessionId) : 0;
  return Response.json({ ok: true, removed });
}

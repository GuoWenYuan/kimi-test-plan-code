import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPetById } from "@/lib/pet-store";
import { deleteTask, updateTask } from "@/lib/pet-tasks";

async function requireOwner(params: Promise<{ id: string; taskId: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const { id, taskId } = await params;
  const result = getPetById(id);
  if (!result) return { error: NextResponse.json({ error: "宠物不存在" }, { status: 404 }) };
  if (result.pet.ownerUserId !== user.id) {
    return { error: NextResponse.json({ error: "只有主人可以管理定时任务" }, { status: 403 }) };
  }
  return { petId: id, taskId };
}

/** 更新任务：改名 / 内容 / cron / 间隔 / 一次性时间 / 启停（仅主人） */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as
    | { name?: string; prompt?: string; cron?: string; intervalMinutes?: number | null; runAt?: number | null; enabled?: boolean }
    | null;
  if (!body) return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  const result = updateTask(r.petId, r.taskId, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ task: result.task });
}

/** 删除任务（仅主人） */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  if (!deleteTask(r.petId, r.taskId)) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

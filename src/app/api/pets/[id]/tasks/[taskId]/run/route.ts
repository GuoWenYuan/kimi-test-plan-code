import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isPetBusy } from "@/lib/pet-busy";
import { getPetById } from "@/lib/pet-store";
import { runTaskNow } from "@/lib/pet-tasks";

/** 立即运行一次任务（仅主人）；宠物忙碌（聊天中/任务执行中）时返回 409 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, taskId } = await params;
  const result = getPetById(id);
  if (!result) return NextResponse.json({ error: "宠物不存在" }, { status: 404 });
  if (result.pet.ownerUserId !== user.id) {
    return NextResponse.json({ error: "只有主人可以运行任务" }, { status: 403 });
  }
  if (isPetBusy(id)) {
    return NextResponse.json({ error: "宠物正在忙（聊天或执行其他任务），稍后再试" }, { status: 409 });
  }
  // 异步执行，前端随后轮询任务状态看结果
  runTaskNow(id, taskId).catch((e) => console.error("[pet-tasks] 立即运行异常:", e));
  return NextResponse.json({ ok: true });
}

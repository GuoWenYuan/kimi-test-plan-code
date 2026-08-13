import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPetById } from "@/lib/pet-store";
import { createTask, ensureSchedulerStarted, listTasks } from "@/lib/pet-tasks";

async function requireOwner(params: Promise<{ id: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return { error: NextResponse.json({ error: "宠物不存在" }, { status: 404 }) };
  if (result.pet.ownerUserId !== user.id) {
    return { error: NextResponse.json({ error: "只有主人可以管理定时任务" }, { status: 403 }) };
  }
  return { petId: id };
}

/** 任务列表（仅主人）；顺带确保调度器已启动 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  ensureSchedulerStarted();
  return NextResponse.json({ tasks: listTasks(r.petId) });
}

/** 新建任务：{ name, prompt } + 调度三选一（cron / intervalMinutes / runAt）；cron 五段：分 时 日 月 周，服务器本地时区 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  ensureSchedulerStarted();
  const body = (await req.json().catch(() => null)) as
    | { name?: string; prompt?: string; cron?: string; intervalMinutes?: number | null; runAt?: number | null }
    | null;
  const result = createTask(r.petId, String(body?.name ?? ""), String(body?.prompt ?? ""), {
    cron: body?.cron,
    intervalMinutes: body?.intervalMinutes,
    runAt: body?.runAt,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ task: result.task });
}

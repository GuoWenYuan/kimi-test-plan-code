import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { adoptPet, getMyPet, renamePet } from "@/lib/pet-store";
import { ensureSchedulerStarted, takeTaskNotices } from "@/lib/pet-tasks";

/** 读取当前用户的宠物（含定时任务汇报）；未领养返回 { pet: null } */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  ensureSchedulerStarted();
  const result = getMyPet(user.id);
  if (!result) return NextResponse.json({ pet: null });
  return NextResponse.json({
    pet: result.pet,
    // 宠物刚完成的定时任务（取出即标记已通知，悬浮球气泡展示一次）
    notices: takeTaskNotices(result.pet.id),
  });
}

/** 操作：adopt（传 petId，可带 name 改名）/ rename */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { action?: string; name?: string; petId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (body.action === "adopt") {
    if (typeof body.petId !== "string" || !body.petId) {
      return NextResponse.json({ error: "缺少 petId" }, { status: 400 });
    }
    const result = adoptPet(user.id, body.petId, body.name);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ pet: result.pet });
  }
  if (body.action === "rename") {
    const pet = renamePet(user.id, String(body.name ?? ""));
    if (!pet) return NextResponse.json({ error: "未领养或名字为空" }, { status: 400 });
    return NextResponse.json({ pet });
  }
  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}

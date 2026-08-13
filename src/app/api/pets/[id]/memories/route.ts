import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addMemory, deleteMemory, getPetById, listMemories } from "@/lib/pet-store";

async function requireOwner(params: Promise<{ id: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return { error: NextResponse.json({ error: "宠物不存在" }, { status: 404 }) };
  if (result.pet.ownerUserId !== user.id) {
    return { error: NextResponse.json({ error: "只有主人可以查看和管理记忆" }, { status: 403 }) };
  }
  return { petId: id };
}

/** 记忆列表（仅主人） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  return NextResponse.json({ memories: listMemories(r.petId) });
}

/** 手动补一条记忆（仅主人）；聊天中的"记住…"会自动精简入库，无需走这里 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as { content?: string } | null;
  const memory = addMemory(r.petId, String(body?.content ?? ""));
  if (!memory) return NextResponse.json({ error: "内容为空或与现有记忆重复" }, { status: 400 });
  return NextResponse.json({ memory });
}

/** 删除一条记忆（仅主人），query 传 memoryId */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  const memoryId = new URL(req.url).searchParams.get("memoryId") ?? "";
  if (!deleteMemory(r.petId, memoryId)) {
    return NextResponse.json({ error: "记忆不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

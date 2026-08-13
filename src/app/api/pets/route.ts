import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createPet, getMyPet, listPets } from "@/lib/pet-store";

/** 宠物池列表（所有登录用户可见），附带当前用户的宠物 id */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ pets: listPets(), myPetId: getMyPet(user.id)?.pet.id ?? null });
}

/** 新增宠物入池（仅超管） */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "仅管理员可以新增宠物" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  return NextResponse.json({ pet: createPet(String(body?.name ?? "")) });
}

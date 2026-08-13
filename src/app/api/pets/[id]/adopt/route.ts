import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { adoptPet } from "@/lib/pet-store";

/** 领养池内未被领养的宠物（一人限一只） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const result = adoptPet(user.id, id, body.name);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ pet: result.pet });
}

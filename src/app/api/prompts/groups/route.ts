import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addGroup } from "@/lib/prompts-store";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { name } = body ?? {};
  const result = await addGroup(String(name ?? ""));
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

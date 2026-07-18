import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deletePreset, updatePreset } from "@/lib/models-store";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const { name, model, baseUrl, apiKey } = body ?? {};
  const updated = await updatePreset(user.id, id, { name, model, baseUrl, apiKey });
  if (!updated) {
    return NextResponse.json({ error: "预设不存在" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deletePreset(user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "预设不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

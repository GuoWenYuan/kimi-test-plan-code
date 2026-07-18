import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteTemplate, updateTemplate } from "@/lib/prompts-store";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const { name, description, content, group } = body ?? {};
  const updated = await updateTemplate(id, { name, description, content, group });
  if (!updated) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteTemplate(id);
  if (!ok) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

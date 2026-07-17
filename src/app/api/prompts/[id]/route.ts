import { NextResponse } from "next/server";
import { deleteTemplate, updateTemplate } from "@/lib/prompts-store";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
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
  const { id } = await ctx.params;
  const ok = await deleteTemplate(id);
  if (!ok) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

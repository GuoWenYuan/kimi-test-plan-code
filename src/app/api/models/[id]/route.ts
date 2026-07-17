import { NextResponse } from "next/server";
import { deletePreset, updatePreset } from "@/lib/models-store";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const { name, model, baseUrl, apiKey } = body ?? {};
  const updated = await updatePreset(id, { name, model, baseUrl, apiKey });
  if (!updated) {
    return NextResponse.json({ error: "预设不存在" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deletePreset(id);
  if (!ok) {
    return NextResponse.json({ error: "预设不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

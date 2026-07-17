import { NextResponse } from "next/server";
import { deleteWorkflow } from "@/lib/workflows-store";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deleteWorkflow(id);
  if (!ok) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

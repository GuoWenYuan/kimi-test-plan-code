import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteWorkflow } from "@/lib/workflows-store";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteWorkflow(id);
  if (!ok) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

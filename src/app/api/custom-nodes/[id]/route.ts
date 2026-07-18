import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteCustomNode } from "@/lib/custom-nodes-store";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteCustomNode(id);
  if (!ok) {
    return NextResponse.json({ error: "节点不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

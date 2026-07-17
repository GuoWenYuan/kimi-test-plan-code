import { NextResponse } from "next/server";
import { deleteCustomNode } from "@/lib/custom-nodes-store";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deleteCustomNode(id);
  if (!ok) {
    return NextResponse.json({ error: "节点不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

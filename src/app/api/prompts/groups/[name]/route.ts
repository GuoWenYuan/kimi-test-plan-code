import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteGroup } from "@/lib/prompts-store";

type Ctx = { params: Promise<{ name: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { name } = await ctx.params;
  const result = await deleteGroup(decodeURIComponent(name));
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

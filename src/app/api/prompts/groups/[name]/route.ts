import { NextResponse } from "next/server";
import { deleteGroup } from "@/lib/prompts-store";

type Ctx = { params: Promise<{ name: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  const result = await deleteGroup(decodeURIComponent(name));
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

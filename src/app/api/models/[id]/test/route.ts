import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPreset } from "@/lib/models-store";
import { testPreset } from "@/lib/llm";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const preset = await getPreset(user.id, id);
  if (!preset) {
    return NextResponse.json({ error: "预设不存在" }, { status: 404 });
  }
  try {
    const reply = await testPreset(preset);
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";
import { getPreset } from "@/lib/models-store";
import { testPreset } from "@/lib/llm";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const preset = await getPreset(id);
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

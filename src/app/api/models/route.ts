import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createPreset, listPresets } from "@/lib/models-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(await listPresets(user.id));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { name, model, baseUrl, apiKey } = body ?? {};
  if (!name || !model || !baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "name / model / baseUrl / apiKey 均为必填" },
      { status: 400 }
    );
  }
  const preset = await createPreset(user.id, { name, model, baseUrl, apiKey });
  return NextResponse.json(preset, { status: 201 });
}

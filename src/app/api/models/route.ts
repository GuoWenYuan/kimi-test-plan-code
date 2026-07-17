import { NextResponse } from "next/server";
import { createPreset, listPresets } from "@/lib/models-store";

export async function GET() {
  return NextResponse.json(await listPresets());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { name, model, baseUrl, apiKey } = body ?? {};
  if (!name || !model || !baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "name / model / baseUrl / apiKey 均为必填" },
      { status: 400 }
    );
  }
  const preset = await createPreset({ name, model, baseUrl, apiKey });
  return NextResponse.json(preset, { status: 201 });
}

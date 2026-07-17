import { NextResponse } from "next/server";
import { addGroup, deleteGroup } from "@/lib/prompts-store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { name } = body ?? {};
  const result = await addGroup(String(name ?? ""));
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

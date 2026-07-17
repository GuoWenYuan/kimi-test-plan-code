import { NextResponse } from "next/server";
import { createNote, getGraph, listNotes } from "@/lib/knowledge";

export async function GET() {
  const [notes, graph] = await Promise.all([listNotes(), getGraph()]);
  return NextResponse.json({ notes, graph });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { slug, content } = body ?? {};
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "slug 为必填" }, { status: 400 });
  }
  const existing = await import("@/lib/knowledge").then((m) => m.readNote(slug));
  if (existing !== null) {
    return NextResponse.json({ error: "同名笔记已存在" }, { status: 409 });
  }
  await createNote(slug, typeof content === "string" ? content : `# ${slug}\n\n`);
  return NextResponse.json({ ok: true }, { status: 201 });
}

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createNote, getGraph, listNotes, readNote } from "@/lib/knowledge";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const [notes, graph] = await Promise.all([listNotes(user.id), getGraph(user.id)]);
  return NextResponse.json({ notes, graph });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { slug, content } = body ?? {};
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "slug 为必填" }, { status: 400 });
  }
  if ((await readNote(user.id, slug)) !== null) {
    return NextResponse.json({ error: "同名笔记已存在" }, { status: 409 });
  }
  await createNote(user.id, slug, typeof content === "string" ? content : `# ${slug}\n\n`);
  return NextResponse.json({ ok: true }, { status: 201 });
}

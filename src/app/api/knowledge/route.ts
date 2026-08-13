import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { createNote, getGraph, listNotes, readNote, searchKnowledge } from "@/lib/knowledge";

export async function GET(req: Request) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  // 带 q 时按检索词搜索笔记（标题/标签/正文），供 MCP 等外部工具使用
  if (q !== null) {
    const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit")) || 3));
    const hits = await searchKnowledge(user.id, q, limit);
    return NextResponse.json({ hits });
  }
  const [notes, graph] = await Promise.all([listNotes(user.id), getGraph(user.id)]);
  return NextResponse.json({ notes, graph });
}

export async function POST(req: Request) {
  const user = await getApiUser(req);
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

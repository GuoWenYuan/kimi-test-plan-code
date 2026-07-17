import { NextResponse } from "next/server";
import { deleteNote, getBacklinks, readNote, updateNote } from "@/lib/knowledge";

type Ctx = { params: Promise<{ slug: string[] }> };

async function toSlug(ctx: Ctx): Promise<string> {
  const { slug } = await ctx.params;
  return slug.map(decodeURIComponent).join("/");
}

export async function GET(_req: Request, ctx: Ctx) {
  const slug = await toSlug(ctx);
  const content = await readNote(slug);
  if (content === null) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  const backlinks = await getBacklinks(slug);
  return NextResponse.json({ slug, content, backlinks });
}

export async function PUT(req: Request, ctx: Ctx) {
  const slug = await toSlug(ctx);
  const body = await req.json().catch(() => null);
  const ok = await updateNote(slug, String(body?.content ?? ""));
  if (!ok) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const slug = await toSlug(ctx);
  const ok = await deleteNote(slug);
  if (!ok) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

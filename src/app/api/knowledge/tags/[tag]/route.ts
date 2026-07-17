import { NextResponse } from "next/server";
import { deleteNotesByTag, removeTagFromAllNotes } from "@/lib/knowledge";

type Ctx = { params: Promise<{ tag: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const { tag } = await ctx.params;
  const name = decodeURIComponent(tag);
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "notes") {
    // 连带删除该标签下的所有笔记
    const deleted = await deleteNotesByTag(name);
    return NextResponse.json({ ok: true, mode, removed: name, deletedNotes: deleted });
  }
  const changed = await removeTagFromAllNotes(name);
  return NextResponse.json({ ok: true, mode: "tag", removed: name, affectedNotes: changed });
}

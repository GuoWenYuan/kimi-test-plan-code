import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createCustomNode, listCustomNodes } from "@/lib/custom-nodes-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(await listCustomNodes());
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { name, description, tag, mode, content } = body ?? {};
  if (!name || !content || (mode !== "llm" && mode !== "code")) {
    return NextResponse.json({ error: "name / content / mode(llm|code) 为必填" }, { status: 400 });
  }
  const def = await createCustomNode({
    name,
    description: description ?? "",
    tag: tag?.trim() || "默认",
    mode,
    content,
  });
  return NextResponse.json(def, { status: 201 });
}

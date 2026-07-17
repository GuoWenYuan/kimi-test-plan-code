import { NextResponse } from "next/server";
import { createTemplate, getPromptsData, DEFAULT_GROUP } from "@/lib/prompts-store";

export async function GET() {
  return NextResponse.json(await getPromptsData());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { name, description, content, group } = body ?? {};
  if (!name || !content) {
    return NextResponse.json({ error: "name / content 均为必填" }, { status: 400 });
  }
  const tpl = await createTemplate({
    name,
    description: description ?? "",
    content,
    group: group || DEFAULT_GROUP,
  });
  return NextResponse.json(tpl, { status: 201 });
}

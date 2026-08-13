import { NextResponse } from "next/server";
import { getApiUser, getSessionUser } from "@/lib/auth";
import { createTemplate, getPromptsData, DEFAULT_GROUP } from "@/lib/prompts-store";

// GET 双认证（session cookie 或 Bearer 个人 API 令牌），供统一桥 MCP 模式读取
export async function GET(req: Request) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(await getPromptsData());
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
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

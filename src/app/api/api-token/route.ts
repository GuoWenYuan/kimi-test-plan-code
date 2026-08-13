import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateApiToken, regenerateApiToken } from "@/lib/store";

/** 获取当前用户的 API 令牌（不存在则生成），供知识库 MCP 等本机工具使用 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ token: getOrCreateApiToken(user.id) });
}

/** 重置令牌：旧令牌立即失效 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ token: regenerateApiToken(user.id) });
}

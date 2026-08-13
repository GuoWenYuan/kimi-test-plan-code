import { getSessionUser } from "@/lib/auth";

/** @deprecated 旧知识库 MCP 脚本下载入口：已并入统一桥（mcp 子命令），重定向到 /api/bridge */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.redirect(new URL("/api/bridge", req.url), 302);
}

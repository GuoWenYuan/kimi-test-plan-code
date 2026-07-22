import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";

/** 下载通用本机桥脚本（需登录），仿 unity-bridge 下载 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const filePath = path.join(process.cwd(), "tools", "local-bridge.mjs");
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch {
    return Response.json({ error: "桥文件不存在" }, { status: 404 });
  }
  return new Response(source, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="local-bridge.mjs"',
    },
  });
}

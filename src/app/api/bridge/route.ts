import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";

/** 下载统一本机桥脚本 workbench-bridge.mjs（需登录）：本机 HTTP 桥 + 远程设备心跳 + 知识库 MCP 三合一 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const filePath = path.join(process.cwd(), "tools", "workbench-bridge.mjs");
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch {
    return Response.json({ error: "桥文件不存在" }, { status: 404 });
  }
  return new Response(source, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="workbench-bridge.mjs"',
    },
  });
}

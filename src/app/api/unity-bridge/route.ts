import fs from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";

/** GET /api/unity-bridge —— 下载 Unity Bridge 插件源码（UnityBridge.cs） */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const filePath = path.join(process.cwd(), "unity-bridge", "Editor", "UnityBridge.cs");
  let source: string;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch {
    return Response.json({ error: "插件文件不存在" }, { status: 404 });
  }

  return new Response(source, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="UnityBridge.cs"',
    },
  });
}

import fs from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";

/** GET /api/frame-embed —— 下载「控制台内嵌助手」Chrome 扩展（frame-embed.zip） */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const filePath = path.join(process.cwd(), "frame-embed.zip");
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return Response.json({ error: "扩展包不存在" }, { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="frame-embed.zip"',
    },
  });
}

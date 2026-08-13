import fs from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";

/** GET /api/usage-panel —— 下载「AI 工作台用量面板」Chrome 扩展（usage-panel.zip） */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const filePath = path.join(process.cwd(), "usage-panel.zip");
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return Response.json({ error: "扩展包不存在" }, { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="usage-panel.zip"',
    },
  });
}

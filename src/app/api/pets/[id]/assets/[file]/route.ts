import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { petAssetsDir } from "@/lib/pet-chat";
import { getPetById } from "@/lib/pet-store";

const CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** 读取宠物外观资源（登录用户可见；文件名严格 basename 防路径穿越） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const { id, file } = await params;
  if (!getPetById(id)) return Response.json({ error: "宠物不存在" }, { status: 404 });

  const safe = path.basename(file);
  if (!safe || safe !== file) return Response.json({ error: "文件名非法" }, { status: 400 });
  const type = CONTENT_TYPE[path.extname(safe).toLowerCase()];
  if (!type) return Response.json({ error: "不支持的文件类型" }, { status: 400 });

  let data: Buffer;
  try {
    data = fs.readFileSync(path.join(petAssetsDir(id), safe));
  } catch {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
  });
}

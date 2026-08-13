import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { petAssetsDir } from "@/lib/pet-chat";
import { getPetById } from "@/lib/pet-store";

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const MAX_SIZE = 5 * 1024 * 1024;

async function requireEditor(params: Promise<{ id: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return { error: NextResponse.json({ error: "宠物不存在" }, { status: 404 }) };
  if (result.pet.ownerUserId !== user.id && user.role !== "super_admin") {
    return { error: NextResponse.json({ error: "只有主人或管理员可以管理外观" }, { status: 403 }) };
  }
  return { petId: id };
}

/** 上传表情图片（multipart 字段名 file；png/jpg/gif/webp/svg，≤5MB，GIF 即动画） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireEditor(params);
  if ("error" in r) return r.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件（字段名 file）" }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "仅支持 png/jpg/gif/webp/svg" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "文件不能超过 5MB" }, { status: 400 });
  }

  // 文件名白名单化 + 时间戳防覆盖
  const base = path
    .basename(file.name, ext)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 40) || "expr";
  const fileName = `${Date.now()}-${base}${ext}`;
  const dir = petAssetsDir(r.petId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ file: fileName });
}

/** 删除一个外观资源文件（query 传 file） */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireEditor(params);
  if ("error" in r) return r.error;
  const file = new URL(req.url).searchParams.get("file") ?? "";
  const safe = path.basename(file);
  if (!safe || safe !== file) return NextResponse.json({ error: "文件名非法" }, { status: 400 });
  try {
    fs.unlinkSync(path.join(petAssetsDir(r.petId), safe));
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

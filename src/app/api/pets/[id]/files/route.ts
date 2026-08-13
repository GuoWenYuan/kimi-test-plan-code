import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { petWorkspaceDir } from "@/lib/pet-chat";
import { getPetById } from "@/lib/pet-store";

/** 可预览的文本文件扩展名 */
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".json", ".csv", ".log", ".xml", ".html", ".yaml", ".yml", ".toml"]);
const MAX_FILE_SIZE = 512 * 1024;
const MAX_LIST = 200;

async function requireOwner(params: Promise<{ id: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return { error: NextResponse.json({ error: "宠物不存在" }, { status: 404 }) };
  if (result.pet.ownerUserId !== user.id && user.role !== "super_admin") {
    return { error: NextResponse.json({ error: "只有主人可以查看工作区文档" }, { status: 403 }) };
  }
  return { petId: id };
}

/** 递归收集工作区里的文本文件（跳过隐藏项与 node_modules），返回相对路径 */
function listTextFiles(dir: string, base: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_LIST) return;
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      listTextFiles(full, base, out);
    } else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(path.relative(base, full));
    }
  }
}

/**
 * 工作区文档预览（仅主人）：
 * - GET 无参数 → 列出工作区中的文本文件（相对路径、大小、修改时间）
 * - GET ?file=<相对路径> → 返回该文件文本内容（≤512KB）
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;

  const root = petWorkspaceDir(r.petId);
  const file = new URL(req.url).searchParams.get("file");

  if (!file) {
    const files: string[] = [];
    listTextFiles(root, root, files);
    const list = files
      .map((rel) => {
        try {
          const st = fs.statSync(path.join(root, rel));
          return { file: rel, size: st.size, updatedAt: st.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((f): f is { file: string; size: number; updatedAt: number } => f !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ files: list });
  }

  // 防路径穿越：解析后的绝对路径必须落在工作区内
  const abs = path.resolve(root, file);
  if (!abs.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "路径非法" }, { status: 400 });
  }
  if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) {
    return NextResponse.json({ error: "该类型文件不支持预览" }, { status: 400 });
  }
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  if (!st.isFile() || st.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "文件太大，无法预览（上限 512KB）" }, { status: 400 });
  }
  const content = fs.readFileSync(abs, "utf-8");
  return NextResponse.json({ file, content, updatedAt: st.mtimeMs });
}

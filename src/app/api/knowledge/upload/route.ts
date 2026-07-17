import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { createNote, readNote } from "@/lib/knowledge";

const execFileAsync = promisify(execFile);

const SUPPORTED = [".md", ".txt", ".docx", ".doc", ".xmind", ".drawio", ".xls"];

/** 生成不冲突的 slug：重名时追加 -2、-3… */
async function uniqueSlug(base: string): Promise<string> {
  const clean = base.replace(/\.[^.]+$/, "").trim() || "未命名";
  if ((await readNote(clean)) === null) return clean;
  for (let i = 2; ; i++) {
    const candidate = `${clean}-${i}`;
    if ((await readNote(candidate)) === null) return candidate;
  }
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!SUPPORTED.includes(ext)) {
    return NextResponse.json(
      { error: `不支持的格式 ${ext}，支持：${SUPPORTED.join(" ")}` },
      { status: 400 }
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-upload-"));
  try {
    const inputPath = path.join(tmpDir, file.name);
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    let body: string;
    if (ext === ".md" || ext === ".txt") {
      body = await fs.readFile(inputPath, "utf-8");
    } else {
      // 非 md 格式：调用 Python 转换管线（doc/docx/xmind/drawio/xls）
      const outputPath = path.join(tmpDir, "out.md");
      try {
        await execFileAsync(
          path.join(process.cwd(), "tools", ".venv", "Scripts", "python.exe"),
          [path.join(process.cwd(), "tools", "convert_file.py"), inputPath, outputPath],
          { timeout: 60_000 }
        );
      } catch (e) {
        const stderr = (e as { stderr?: string }).stderr ?? "";
        return NextResponse.json({ error: `转换失败：${stderr || "未知错误"}` }, { status: 422 });
      }
      body = await fs.readFile(outputPath, "utf-8");
    }

    const slug = await uniqueSlug(file.name);
    const title = path.basename(file.name, ext);
    await createNote(slug, `# ${title}\n\n${body}`);
    return NextResponse.json({ ok: true, slug }, { status: 201 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

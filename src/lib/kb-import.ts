import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createNote } from "./knowledge";
import { getPreset } from "./models-store";
import { createChatModel } from "./llm";

const execFileAsync = promisify(execFile);

/** 可直接转 Markdown 的文档格式（走 Python 转换管线） */
const DOC_EXT = new Set([".docx", ".doc", ".xmind", ".drawio", ".xls", ".md", ".txt"]);
/** 代码/文本格式（提取结构大纲） */
const CODE_EXT = new Set([".cs", ".ts", ".tsx", ".js", ".py", ".cpp", ".h", ".java", ".go", ".rs"]);
const SKIP_EXT = new Set([".meta", ".bkp", ".dtmp", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".fbx", ".asset", ".prefab", ".unity"]);
const MAX_FILES = 200;
const MAX_CONTENT_CHARS = 20000;
/** 交给大模型的素材上限 */
const LLM_MATERIAL_CHARS = 12000;
/** 大模型生成时的并发数 */
const LLM_CONCURRENCY = 3;

export interface ImportResult {
  imported: number;
  skipped: number;
  indexSlug: string;
  slugs: string[];
  /** 是否使用了大模型生成文档 */
  llm: boolean;
}

async function scanFiles(target: string): Promise<string[]> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return [target];
  const out: string[] = [];
  async function walk(dir: string) {
    if (out.length >= MAX_FILES) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        const base = path.basename(e.name, ext);
        // 在扫描阶段就排除无关文件，数量上限只针对候选文件
        if (SKIP_EXT.has(ext) || base.startsWith("~$") || base.startsWith(".$")) continue;
        if (!DOC_EXT.has(ext) && !CODE_EXT.has(ext)) continue;
        out.push(full);
      }
    }
  }
  await walk(target);
  return out;
}

/** 代码文件提取结构大纲（类/接口/枚举/方法签名） */
function codeOutline(content: string, ext: string): string {
  const lines: string[] = [];
  const patterns =
    ext === ".cs"
      ? [
          /^\s*(?:\[.*\]\s*)*(?:public|internal|protected|private)?\s*(?:static\s+|abstract\s+|sealed\s+|partial\s+)*(class|interface|enum|struct)\s+[\w<>`,\s:]+/,
          /^\s*(?:public|protected|internal)\s+(?:static\s+|virtual\s+|override\s+|abstract\s+|async\s+)*[\w<>\[\],.?]+\s+\w+\s*\([^)]*\)/,
        ]
      : [/^\s*(?:export\s+)?(?:default\s+)?(class|interface|function|enum)\s+\w+/, /^\s*(?:export\s+)?(?:async\s+)?(?:def|fn|func|public)\s+\w+\s*\(/];
  for (const line of content.split("\n")) {
    if (patterns.some((p) => p.test(line))) {
      const t = line.trim();
      if (t.length < 200) lines.push(t.replace(/\s*\{\s*$/, ""));
    }
  }
  return lines.join("\n");
}

async function convertDoc(inputPath: string, tmpDir: string): Promise<string> {
  const out = path.join(tmpDir, `${path.basename(inputPath)}.md`);
  await execFileAsync(
    path.join(process.cwd(), "tools", ".venv", "Scripts", "python.exe"),
    [path.join(process.cwd(), "tools", "convert_file.py"), inputPath, out],
    { timeout: 60_000 }
  );
  return fs.readFile(out, "utf-8");
}

/** 读取代码/文本文件，自动处理 GBK 编码 */
async function readText(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("gbk").decode(buf);
  }
}

/** 提取文件的原始文本素材（供大模型或机械大纲使用） */
async function extractMaterial(file: string, ext: string, tmpDir: string): Promise<string> {
  if (ext === ".md" || ext === ".txt") return readText(file);
  if (DOC_EXT.has(ext)) return convertDoc(file, tmpDir);
  if (CODE_EXT.has(ext)) return readText(file);
  return "";
}

function mechanicalDoc(material: string, ext: string): string {
  if (CODE_EXT.has(ext)) {
    const outline = codeOutline(material, ext);
    return outline
      ? `## 结构大纲\n\n\`\`\`\n${outline}\n\`\`\``
      : `## 源码\n\n\`\`\`${ext.slice(1)}\n${material.slice(0, MAX_CONTENT_CHARS)}\n\`\`\``;
  }
  return material;
}

const DOC_PROMPT = `请基于以下文件内容，生成一篇中文知识库文档（Markdown）。
要求：
- 严格基于素材，不要编造不存在的类、函数或行为；素材是代码时以真实类名/方法名为准
- 结构：## 概述（2-4 句） / ## 主要内容（列表或表格） / ## 关键 API 与用法（如素材是代码）
- 只输出文档正文，不要输出额外解释
- 文件路径：%PATH%
- 素材：
%MATERIAL%`;

type ChatModel = ReturnType<typeof createChatModel>;

async function llmDoc(model: ChatModel, file: string, material: string): Promise<string> {
  const prompt = DOC_PROMPT.replace("%PATH%", file).replace(
    "%MATERIAL%",
    material.slice(0, LLM_MATERIAL_CHARS)
  );
  const res = await model.invoke(prompt);
  const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  if (!text.trim()) throw new Error("模型返回为空");
  return text;
}

/**
 * 知识库导入节点：把本地目录/文件转换为 Markdown 笔记导入知识库。
 * - 每篇笔记强制打上 #tag #subTag
 * - 可选模型：选了则由大模型逐文件生成文档（失败自动回退为机械大纲）
 * - 生成总览索引笔记（[[双链]] 指向全部导入笔记），图谱由此自动形成
 */
export async function importToKnowledge(
  targetPath: string,
  tag: string,
  subTag: string,
  presetId?: string
): Promise<ImportResult> {
  let model: ChatModel | null = null;
  if (presetId) {
    const preset = await getPreset(presetId);
    if (!preset) throw new Error("所选模型预设不存在，可能已被删除");
    model = createChatModel(preset);
  }

  const files = await scanFiles(targetPath);
  const group = subTag;
  const slugs: string[] = [];
  let skipped = 0;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-import-"));
  try {
    const processOne = async (file: string) => {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, ext);

      let material: string;
      try {
        material = await extractMaterial(file, ext, tmpDir);
      } catch {
        skipped++;
        return;
      }
      if (!material.trim()) {
        skipped++;
        return;
      }

      let body: string;
      if (model) {
        try {
          body = await llmDoc(model, file, material);
        } catch {
          // 模型调用失败回退为机械大纲
          body = mechanicalDoc(material, ext);
        }
      } else {
        body = mechanicalDoc(material, ext);
      }

      const slug = `${group}/${base}`;
      const note = `# ${base}\n\n#${tag} #${subTag}\n\n> 来源：${file}\n\n---\n\n${body.slice(0, MAX_CONTENT_CHARS)}\n\n---\n\n所属：[[${subTag}总览]]\n`;
      await createNote(slug, note);
      slugs.push(slug);
    };

    if (model) {
      // 大模型生成：小并发执行
      for (let i = 0; i < files.length; i += LLM_CONCURRENCY) {
        await Promise.all(files.slice(i, i + LLM_CONCURRENCY).map(processOne));
      }
    } else {
      for (const file of files) await processOne(file);
    }

    // 总览索引笔记：双链指向全部导入笔记
    const indexSlug = `${group}/${subTag}总览`;
    const list = slugs
      .map((s) => `- [[${s.split("/").pop()}]]`)
      .join("\n");
    await createNote(
      indexSlug,
      `# ${subTag} 总览\n\n#${tag} #${subTag}\n\n> 来源：${targetPath}\n\n## 包含笔记（${slugs.length}）\n\n${list}\n`
    );
    slugs.push(indexSlug);

    return { imported: slugs.length - 1, skipped, indexSlug, slugs, llm: !!model };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

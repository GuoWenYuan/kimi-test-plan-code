import { promises as fs } from "fs";
import path from "path";
import {
  bootstrap,
  URI,
  GenericDataStore,
  AlwaysIncludeMatcher,
  MarkdownResourceProvider,
  createMarkdownParser,
  type Foam,
} from "foam-core";

/**
 * 知识库：基于 foam-core 的 Markdown 图谱知识库。
 * 存储为 data/knowledge/ 下的纯 .md 文件，支持 [[wikilink]] 双链、#标签、反向链接。
 */

const KB_DIR = path.join(process.cwd(), "data", "knowledge");

export interface NoteMeta {
  slug: string;
  title: string;
  tags: string[];
  linkCount: number;
  backlinkCount: number;
}

export interface KnowledgeGraph {
  nodes: { slug: string; title: string }[];
  edges: { source: string; target: string }[];
}

async function listMdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries as { name: string; isDirectory(): boolean }[]) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listMdFiles(full)));
    else if (e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function toSlug(fsPath: string): string {
  const rel = path.relative(KB_DIR, fsPath);
  return rel.replace(/\\/g, "/").replace(/\.md$/i, "");
}

function toFsPath(slug: string): string {
  const safe = slug.replace(/\.\./g, "").replace(/^[/\\]+/, "");
  return path.join(KB_DIR, `${safe}.md`);
}

let foamCache: { promise: Promise<Foam>; at: number } | null = null;
const CACHE_TTL_MS = 5000; // 外部直接改 md 文件（VS Code/Obsidian）后最多 5s 生效

async function getFoam(): Promise<Foam> {
  if (foamCache && Date.now() - foamCache.at < CACHE_TTL_MS) {
    return foamCache.promise;
  }
  const stale = foamCache?.promise;
  const promise = (async () => {
    await fs.mkdir(KB_DIR, { recursive: true });
    const files = (await listMdFiles(KB_DIR)).map((f) => URI.file(f));
    const store = new GenericDataStore(
      async () => files,
      async (uri) => fs.readFile(uri.toFsPath(), "utf-8")
    );
    const parser = createMarkdownParser();
    const foam = await bootstrap(
      [URI.file(KB_DIR)],
      new AlwaysIncludeMatcher(),
      undefined,
      store,
      parser,
      [new MarkdownResourceProvider(store, parser)]
    );
    // 新索引就绪后释放旧的
    stale?.then((f) => f.dispose()).catch(() => {});
    return foam;
  })();
  // 失败时允许重试
  promise.catch(() => {
    if (foamCache?.promise === promise) foamCache = null;
  });
  foamCache = { promise, at: Date.now() };
  return promise;
}

/** 写操作后重建索引（知识库规模小，直接重扫） */
async function invalidate(): Promise<void> {
  const foam = await foamCache?.promise.catch(() => null);
  foam?.dispose();
  foamCache = null;
}

export async function listNotes(): Promise<NoteMeta[]> {
  const foam = await getFoam();
  return foam.workspace
    .list()
    .map((r) => ({
      slug: toSlug(r.uri.toFsPath()),
      title: r.title || toSlug(r.uri.toFsPath()),
      tags: [...new Set(r.tags.map((t) => t.label))],
      linkCount: r.links.length,
      backlinkCount: new Set(
        foam.graph.getBacklinks(r.uri).map((c) => toSlug(c.source.toFsPath()))
      ).size,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

export async function getGraph(): Promise<KnowledgeGraph> {
  const foam = await getFoam();
  const nodes = foam.workspace.list().map((r) => ({
    slug: toSlug(r.uri.toFsPath()),
    title: r.title || toSlug(r.uri.toFsPath()),
  }));
  const seen = new Set<string>();
  const edges = foam.graph
    .getAllConnections()
    .filter((c) => c.source.scheme === "file" && c.target.scheme === "file")
    .map((c) => ({
      source: toSlug(c.source.toFsPath()),
      target: toSlug(c.target.toFsPath()),
    }))
    .filter((e) => {
      const key = `${e.source}->${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { nodes, edges };
}

export async function getBacklinks(slug: string): Promise<string[]> {
  const foam = await getFoam();
  const uri = URI.file(toFsPath(slug));
  const slugs = foam.graph
    .getBacklinks(uri)
    .map((c) => toSlug(c.source.toFsPath()))
    .filter((s) => s !== slug);
  return [...new Set(slugs)];
}

export async function readNote(slug: string): Promise<string | null> {
  try {
    return await fs.readFile(toFsPath(slug), "utf-8");
  } catch {
    return null;
  }
}

export async function createNote(slug: string, content: string): Promise<void> {
  const fp = toFsPath(slug);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, content, "utf-8");
  await invalidate();
}

export async function updateNote(slug: string, content: string): Promise<boolean> {
  const fp = toFsPath(slug);
  try {
    await fs.access(fp);
  } catch {
    return false;
  }
  await fs.writeFile(fp, content, "utf-8");
  await invalidate();
  return true;
}

export async function deleteNote(slug: string): Promise<boolean> {
  try {
    await fs.unlink(toFsPath(slug));
    await invalidate();
    return true;
  } catch {
    return false;
  }
}

export interface KnowledgeSearchHit {
  slug: string;
  title: string;
  tags: string[];
  content: string;
}

/** 供工作流知识库节点使用：按检索词搜索笔记（标题/标签/正文），返回最匹配的内容 */
export async function searchKnowledge(query: string, limit = 3): Promise<KnowledgeSearchHit[]> {
  const foam = await getFoam();
  const q = query.trim().toLowerCase();
  const hits: { score: number; hit: KnowledgeSearchHit }[] = [];

  for (const r of foam.workspace.list()) {
    const slug = toSlug(r.uri.toFsPath());
    const title = r.title || slug;
    const tags = r.tags.map((t) => t.label);
    const content = (await foam.workspace.readAsMarkdown(r.uri)) ?? "";

    if (!q) {
      hits.push({ score: 0, hit: { slug, title, tags, content: content.slice(0, 1500) } });
      continue;
    }
    let score = 0;
    if (title.toLowerCase().includes(q)) score += 10;
    if (tags.some((t) => t.toLowerCase().includes(q))) score += 5;
    if (content.toLowerCase().includes(q)) score += 2;
    if (score > 0) hits.push({ score, hit: { slug, title, tags, content: content.slice(0, 1500) } });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.hit);
}

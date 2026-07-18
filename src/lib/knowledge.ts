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
import { getDb } from "@/lib/db";

/**
 * 知识库：基于 foam-core 的 Markdown 图谱知识库。
 * 笔记内容存于 SQLite knowledge_notes 表（按 user_id 隔离），
 * foam 索引通过 GenericDataStore 回调从数据库读取（kbDir 仅作 URI 虚拟路径，不落地文件），
 * 支持 [[wikilink]] 双链、#标签、反向链接。
 */

/** 仅用于 foam URI 映射的虚拟路径（笔记实际存储在数据库中） */
function kbDirFor(userId: string): string {
  return path.join(process.cwd(), "data", "users", userId, "knowledge");
}

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

function toSlug(kbDir: string, fsPath: string): string {
  const rel = path.relative(kbDir, fsPath);
  return rel.replace(/\\/g, "/").replace(/\.md$/i, "");
}

function toFsPath(kbDir: string, slug: string): string {
  const safe = slug.replace(/\.\./g, "").replace(/^[/\\]+/, "");
  return path.join(kbDir, `${safe}.md`);
}

// ---------- 数据库读写 ----------

function listSlugs(userId: string): string[] {
  const rows = getDb()
    .prepare("SELECT slug FROM knowledge_notes WHERE user_id = ?")
    .all(userId) as unknown as { slug: string }[];
  return rows.map((r) => r.slug);
}

function readFromDb(userId: string, slug: string): string | null {
  const row = getDb()
    .prepare("SELECT content FROM knowledge_notes WHERE user_id = ? AND slug = ?")
    .get(userId, slug) as unknown as { content: string } | undefined;
  return row?.content ?? null;
}

// ---------- foam 索引（内容来自数据库） ----------

const foamCaches = new Map<string, { promise: Promise<Foam>; at: number }>();
const CACHE_TTL_MS = 5000; // 写操作会主动失效缓存；TTL 仅为兜底

async function getFoam(userId: string): Promise<Foam> {
  const cached = foamCaches.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.promise;
  }
  const kbDir = kbDirFor(userId);
  const stale = cached?.promise;
  const promise = (async () => {
    const store = new GenericDataStore(
      async () => listSlugs(userId).map((slug) => URI.file(toFsPath(kbDir, slug))),
      async (uri) => readFromDb(userId, toSlug(kbDir, uri.toFsPath())) ?? ""
    );
    const parser = createMarkdownParser();
    const foam = await bootstrap(
      [URI.file(kbDir)],
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
    if (foamCaches.get(userId)?.promise === promise) foamCaches.delete(userId);
  });
  foamCaches.set(userId, { promise, at: Date.now() });
  return promise;
}

/** 写操作后重建索引（知识库规模小，直接重扫） */
async function invalidate(userId: string): Promise<void> {
  const foam = await foamCaches.get(userId)?.promise.catch(() => null);
  foam?.dispose();
  foamCaches.delete(userId);
}

export async function listNotes(userId: string): Promise<NoteMeta[]> {
  const foam = await getFoam(userId);
  const kbDir = kbDirFor(userId);
  return foam.workspace
    .list()
    .map((r) => ({
      slug: toSlug(kbDir, r.uri.toFsPath()),
      title: r.title || toSlug(kbDir, r.uri.toFsPath()),
      tags: [...new Set(r.tags.map((t) => t.label))],
      linkCount: r.links.length,
      backlinkCount: new Set(
        foam.graph.getBacklinks(r.uri).map((c) => toSlug(kbDir, c.source.toFsPath()))
      ).size,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

export async function getGraph(userId: string): Promise<KnowledgeGraph> {
  const foam = await getFoam(userId);
  const kbDir = kbDirFor(userId);
  const nodes = foam.workspace.list().map((r) => ({
    slug: toSlug(kbDir, r.uri.toFsPath()),
    title: r.title || toSlug(kbDir, r.uri.toFsPath()),
  }));
  const seen = new Set<string>();
  const edges = foam.graph
    .getAllConnections()
    .filter((c) => c.source.scheme === "file" && c.target.scheme === "file")
    .map((c) => ({
      source: toSlug(kbDir, c.source.toFsPath()),
      target: toSlug(kbDir, c.target.toFsPath()),
    }))
    .filter((e) => {
      const key = `${e.source}->${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { nodes, edges };
}

export async function getBacklinks(userId: string, slug: string): Promise<string[]> {
  const foam = await getFoam(userId);
  const kbDir = kbDirFor(userId);
  const uri = URI.file(toFsPath(kbDir, slug));
  const slugs = foam.graph
    .getBacklinks(uri)
    .map((c) => toSlug(kbDir, c.source.toFsPath()))
    .filter((s) => s !== slug);
  return [...new Set(slugs)];
}

export async function readNote(userId: string, slug: string): Promise<string | null> {
  return readFromDb(userId, slug);
}

export async function createNote(userId: string, slug: string, content: string): Promise<void> {
  getDb()
    .prepare("INSERT OR REPLACE INTO knowledge_notes (user_id, slug, content) VALUES (?, ?, ?)")
    .run(userId, slug, content);
  await invalidate(userId);
}

export async function updateNote(userId: string, slug: string, content: string): Promise<boolean> {
  const result = getDb()
    .prepare("UPDATE knowledge_notes SET content = ? WHERE user_id = ? AND slug = ?")
    .run(content, userId, slug);
  if (result.changes === 0) return false;
  await invalidate(userId);
  return true;
}

export async function deleteNote(userId: string, slug: string): Promise<boolean> {
  const result = getDb()
    .prepare("DELETE FROM knowledge_notes WHERE user_id = ? AND slug = ?")
    .run(userId, slug);
  if (result.changes === 0) return false;
  await invalidate(userId);
  return true;
}

export interface KnowledgeSearchHit {
  slug: string;
  title: string;
  tags: string[];
  content: string;
}

/** 从所有笔记中移除指定标签（#tag 出现处），返回修改的笔记数 */
export async function removeTagFromAllNotes(userId: string, tag: string): Promise<number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT slug, content FROM knowledge_notes WHERE user_id = ?")
    .all(userId) as unknown as { slug: string; content: string }[];
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`#${escaped}(?![\\w\\u4e00-\\u9fa5-])`, "g");
  const update = db.prepare("UPDATE knowledge_notes SET content = ? WHERE user_id = ? AND slug = ?");
  let changed = 0;
  for (const row of rows) {
    if (!re.test(row.content)) continue;
    re.lastIndex = 0;
    const next = row.content
      .replace(re, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/^[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n");
    update.run(next, userId, row.slug);
    changed++;
  }
  if (changed > 0) await invalidate(userId);
  return changed;
}

/** 删除带有指定标签的所有笔记，返回删除的笔记数 */
export async function deleteNotesByTag(userId: string, tag: string): Promise<number> {
  const foam = await getFoam(userId);
  const kbDir = kbDirFor(userId);
  const slugs = foam.workspace
    .list()
    .filter((r) => r.tags.some((t) => t.label === tag))
    .map((r) => toSlug(kbDir, r.uri.toFsPath()));
  const stmt = getDb().prepare("DELETE FROM knowledge_notes WHERE user_id = ? AND slug = ?");
  let deleted = 0;
  for (const slug of slugs) {
    deleted += Number(stmt.run(userId, slug).changes);
  }
  if (deleted > 0) await invalidate(userId);
  return deleted;
}

/** 供工作流知识库节点使用：按检索词搜索笔记（标题/标签/正文），返回最匹配的内容 */
export async function searchKnowledge(
  userId: string,
  query: string,
  limit = 3
): Promise<KnowledgeSearchHit[]> {
  const foam = await getFoam(userId);
  const kbDir = kbDirFor(userId);
  const q = query.trim().toLowerCase();
  const hits: { score: number; hit: KnowledgeSearchHit }[] = [];

  for (const r of foam.workspace.list()) {
    const slug = toSlug(kbDir, r.uri.toFsPath());
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

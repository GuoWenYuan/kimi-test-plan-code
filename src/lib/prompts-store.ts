import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  group: string;
  createdAt: string;
}

export interface PromptsData {
  groups: string[];
  templates: PromptTemplate[];
}

export const DEFAULT_GROUP = "默认";
const DEFAULT_GROUPS = [DEFAULT_GROUP, "程序", "写作"];

const DEFAULT_TEMPLATES: Omit<PromptTemplate, "id" | "createdAt">[] = [
  {
    name: "内容摘要",
    description: "对输入内容做简明摘要",
    group: "默认",
    content: "请对以下内容进行简明扼要的摘要，保留关键信息：\n\n{{input}}",
  },
  {
    name: "JSON 信息提取",
    description: "从内容中提取字段并以 JSON 返回",
    group: "程序",
    content:
      "请从以下内容中提取关键信息，严格以 JSON 对象格式返回，不要输出多余文字：\n\n{{input}}",
  },
  {
    name: "分类打标",
    description: "对内容进行分类并给出标签",
    group: "程序",
    content:
      '请对以下内容进行分类，以 JSON 返回，格式：{"category": "分类", "tags": ["标签1", "标签2"]}：\n\n{{input}}',
  },
  {
    name: "翻译为英文",
    description: "将输入内容翻译为英文",
    group: "写作",
    content: "请将以下内容翻译为流畅自然的英文，只输出译文：\n\n{{input}}",
  },
  {
    name: "润色改写",
    description: "改写内容使其更通顺专业",
    group: "写作",
    content: "请改写以下内容，使其表达更通顺、专业，保持原意不变：\n\n{{input}}",
  },
];

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  content: string;
  grp: string;
  created_at: string;
}

function toTemplate(r: TemplateRow): PromptTemplate {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    content: r.content,
    group: r.grp || DEFAULT_GROUP,
    createdAt: r.created_at,
  };
}

/** 首次使用（分组表为空）时写入预置分组和模板；旧数据由 db.ts 的 JSON 迁移导入 */
function ensureSeeded(): void {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS c FROM prompt_groups").get() as { c: number };
  if (row.c > 0) return;
  const gStmt = db.prepare("INSERT OR IGNORE INTO prompt_groups (name) VALUES (?)");
  for (const g of DEFAULT_GROUPS) gStmt.run(g);
  const tStmt = db.prepare(
    "INSERT OR IGNORE INTO prompt_templates (id, name, description, content, grp, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const t of DEFAULT_TEMPLATES) {
    tStmt.run(crypto.randomUUID(), t.name, t.description, t.content, t.group, new Date().toISOString());
  }
}

export async function getPromptsData(): Promise<PromptsData> {
  ensureSeeded();
  const db = getDb();
  const groups = (db.prepare("SELECT name FROM prompt_groups ORDER BY rowid").all() as unknown as { name: string }[]).map(
    (r) => r.name
  );
  const templates = (
    db.prepare("SELECT * FROM prompt_templates ORDER BY created_at, rowid").all() as unknown as TemplateRow[]
  ).map(toTemplate);
  return { groups, templates };
}

export async function createTemplate(
  input: Omit<PromptTemplate, "id" | "createdAt">
): Promise<PromptTemplate> {
  ensureSeeded();
  const db = getDb();
  const group = input.group || DEFAULT_GROUP;
  db.prepare("INSERT OR IGNORE INTO prompt_groups (name) VALUES (?)").run(group);
  const tpl: PromptTemplate = {
    ...input,
    group,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO prompt_templates (id, name, description, content, grp, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(tpl.id, tpl.name, tpl.description, tpl.content, tpl.group, tpl.createdAt);
  return tpl;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<PromptTemplate, "id" | "createdAt">>
): Promise<PromptTemplate | undefined> {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(id) as unknown as
    | TemplateRow
    | undefined;
  if (!existing) return undefined;
  const current = toTemplate(existing);
  const next: PromptTemplate = {
    ...current,
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    content: patch.content ?? current.content,
    group: patch.group ?? current.group,
  };
  if (next.group) {
    db.prepare("INSERT OR IGNORE INTO prompt_groups (name) VALUES (?)").run(next.group);
  }
  db.prepare("UPDATE prompt_templates SET name = ?, description = ?, content = ?, grp = ? WHERE id = ?").run(
    next.name,
    next.description,
    next.content,
    next.group,
    id
  );
  return next;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM prompt_templates WHERE id = ?").run(id);
  return result.changes > 0;
}

export async function addGroup(name: string): Promise<{ error?: string }> {
  ensureSeeded();
  const trimmed = name.trim();
  if (!trimmed) return { error: "分组名不能为空" };
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM prompt_groups WHERE name = ?").get(trimmed);
  if (exists) return { error: "分组已存在" };
  db.prepare("INSERT INTO prompt_groups (name) VALUES (?)").run(trimmed);
  return {};
}

/** 删除分组：组内模板移入默认分组；默认分组不可删除 */
export async function deleteGroup(name: string): Promise<{ error?: string }> {
  if (name === DEFAULT_GROUP) return { error: "默认分组不可删除" };
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM prompt_groups WHERE name = ?").get(name);
  if (!exists) return { error: "分组不存在" };
  db.prepare("DELETE FROM prompt_groups WHERE name = ?").run(name);
  db.prepare("UPDATE prompt_templates SET grp = ? WHERE grp = ?").run(DEFAULT_GROUP, name);
  return {};
}

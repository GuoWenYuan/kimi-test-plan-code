import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export interface CustomNodeDef {
  id: string;
  name: string;
  description: string;
  tag: string;
  /** llm：content 为提示词模板；code：content 为 JavaScript 代码（可用 input/outputs/knowledge，结果赋给 output） */
  mode: "llm" | "code";
  content: string;
  createdAt: string;
}

interface CustomNodeRow {
  id: string;
  name: string;
  description: string;
  tag: string;
  mode: string;
  content: string;
  created_at: string;
}

function toCustomNode(r: CustomNodeRow): CustomNodeDef {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    tag: r.tag || "默认",
    mode: r.mode === "code" ? "code" : "llm",
    content: r.content,
    createdAt: r.created_at,
  };
}

export async function listCustomNodes(): Promise<CustomNodeDef[]> {
  const rows = getDb()
    .prepare("SELECT * FROM custom_nodes ORDER BY created_at, rowid")
    .all() as unknown as CustomNodeRow[];
  return rows.map(toCustomNode);
}

export async function getCustomNode(id: string): Promise<CustomNodeDef | undefined> {
  const row = getDb().prepare("SELECT * FROM custom_nodes WHERE id = ?").get(id) as unknown as
    | CustomNodeRow
    | undefined;
  return row ? toCustomNode(row) : undefined;
}

export async function createCustomNode(
  input: Omit<CustomNodeDef, "id" | "createdAt">
): Promise<CustomNodeDef> {
  const def: CustomNodeDef = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      "INSERT INTO custom_nodes (id, name, description, tag, mode, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(def.id, def.name, def.description, def.tag, def.mode, def.content, def.createdAt);
  return def;
}

export async function deleteCustomNode(id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM custom_nodes WHERE id = ?").run(id);
  return result.changes > 0;
}

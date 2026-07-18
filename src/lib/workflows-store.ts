import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export interface WorkflowGraph {
  nodes: unknown[];
  edges: unknown[];
  knowledge: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  tag: string;
  graph: WorkflowGraph;
  createdAt: string;
}

interface WorkflowRow {
  id: string;
  name: string;
  tag: string;
  graph: string;
  created_at: string;
}

function toWorkflow(r: WorkflowRow): WorkflowTemplate {
  let graph: WorkflowGraph = { nodes: [], edges: [], knowledge: "" };
  try {
    graph = JSON.parse(r.graph) as WorkflowGraph;
  } catch {
    // 数据损坏时返回空图，不阻断列表
  }
  // 兼容旧数据：无 tag 字段归入默认
  return { id: r.id, name: r.name, tag: r.tag || "默认", graph, createdAt: r.created_at };
}

export async function listWorkflows(): Promise<WorkflowTemplate[]> {
  const rows = getDb().prepare("SELECT * FROM workflows ORDER BY created_at, rowid").all() as unknown as WorkflowRow[];
  return rows.map(toWorkflow);
}

export async function createWorkflow(
  name: string,
  graph: WorkflowGraph,
  tag = "默认"
): Promise<WorkflowTemplate> {
  const tpl: WorkflowTemplate = {
    id: crypto.randomUUID(),
    name,
    tag,
    graph,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare("INSERT INTO workflows (id, name, tag, graph, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(tpl.id, tpl.name, tpl.tag, JSON.stringify(tpl.graph), tpl.createdAt);
  return tpl;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM workflows WHERE id = ?").run(id);
  return result.changes > 0;
}

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

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

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "workflows.json");

async function readAll(): Promise<WorkflowTemplate[]> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const list = JSON.parse(raw) as WorkflowTemplate[];
    // 兼容旧数据：无 tag 字段归入默认
    return list.map((t) => ({ ...t, tag: t.tag || "默认" }));
  } catch {
    return [];
  }
}

async function writeAll(list: WorkflowTemplate[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf-8");
}

export async function listWorkflows(): Promise<WorkflowTemplate[]> {
  return readAll();
}

export async function createWorkflow(
  name: string,
  graph: WorkflowGraph,
  tag = "默认"
): Promise<WorkflowTemplate> {
  const list = await readAll();
  const tpl: WorkflowTemplate = {
    id: crypto.randomUUID(),
    name,
    tag,
    graph,
    createdAt: new Date().toISOString(),
  };
  list.push(tpl);
  await writeAll(list);
  return tpl;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}

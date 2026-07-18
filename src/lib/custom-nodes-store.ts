import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

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

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "custom-nodes.json");

async function readAll(): Promise<CustomNodeDef[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8")) as CustomNodeDef[];
  } catch {
    return [];
  }
}

async function writeAll(list: CustomNodeDef[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf-8");
}

export async function listCustomNodes(): Promise<CustomNodeDef[]> {
  return readAll();
}

export async function getCustomNode(id: string): Promise<CustomNodeDef | undefined> {
  return (await readAll()).find((n) => n.id === id);
}

export async function createCustomNode(
  input: Omit<CustomNodeDef, "id" | "createdAt">
): Promise<CustomNodeDef> {
  const list = await readAll();
  const def: CustomNodeDef = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  list.push(def);
  await writeAll(list);
  return def;
}

export async function deleteCustomNode(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((n) => n.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}

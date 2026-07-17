import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export interface ModelPreset {
  id: string;
  /** 包装名称，如 "Kimi 生产环境" */
  name: string;
  /** 模型名，如 kimi-k2 / gpt-4o */
  model: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "models.json");

async function readAll(): Promise<ModelPreset[]> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    return JSON.parse(raw) as ModelPreset[];
  } catch {
    return [];
  }
}

async function writeAll(list: ModelPreset[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf-8");
}

export async function listPresets(): Promise<ModelPreset[]> {
  return readAll();
}

export async function getPreset(id: string): Promise<ModelPreset | undefined> {
  return (await readAll()).find((p) => p.id === id);
}

export async function createPreset(
  input: Omit<ModelPreset, "id" | "createdAt">
): Promise<ModelPreset> {
  const list = await readAll();
  const preset: ModelPreset = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  list.push(preset);
  await writeAll(list);
  return preset;
}

export async function updatePreset(
  id: string,
  patch: Partial<Omit<ModelPreset, "id" | "createdAt">>
): Promise<ModelPreset | undefined> {
  const list = await readAll();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  list[idx] = { ...list[idx], ...patch };
  await writeAll(list);
  return list[idx];
}

export async function deletePreset(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}

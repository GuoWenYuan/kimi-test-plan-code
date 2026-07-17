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

/** 模型预设按用户隔离存储 */
function fileFor(userId: string): string {
  return path.join(process.cwd(), "data", "users", userId, "models.json");
}

async function readAll(userId: string): Promise<ModelPreset[]> {
  try {
    const raw = await fs.readFile(fileFor(userId), "utf-8");
    return JSON.parse(raw) as ModelPreset[];
  } catch {
    return [];
  }
}

async function writeAll(userId: string, list: ModelPreset[]): Promise<void> {
  const file = fileFor(userId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf-8");
}

export async function listPresets(userId: string): Promise<ModelPreset[]> {
  return readAll(userId);
}

export async function getPreset(userId: string, id: string): Promise<ModelPreset | undefined> {
  return (await readAll(userId)).find((p) => p.id === id);
}

export async function createPreset(
  userId: string,
  input: Omit<ModelPreset, "id" | "createdAt">
): Promise<ModelPreset> {
  const list = await readAll(userId);
  const preset: ModelPreset = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  list.push(preset);
  await writeAll(userId, list);
  return preset;
}

export async function updatePreset(
  userId: string,
  id: string,
  patch: Partial<Omit<ModelPreset, "id" | "createdAt">>
): Promise<ModelPreset | undefined> {
  const list = await readAll(userId);
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  list[idx] = { ...list[idx], ...patch };
  await writeAll(userId, list);
  return list[idx];
}

export async function deletePreset(userId: string, id: string): Promise<boolean> {
  const list = await readAll(userId);
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  await writeAll(userId, next);
  return true;
}

import crypto from "node:crypto";
import { getDb } from "@/lib/db";

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

interface PresetRow {
  id: string;
  user_id: string;
  name: string;
  model: string;
  base_url: string;
  api_key: string;
  created_at: string;
}

function toPreset(r: PresetRow): ModelPreset {
  return {
    id: r.id,
    name: r.name,
    model: r.model,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    createdAt: r.created_at,
  };
}

/** 模型预设按用户隔离存储（SQLite model_presets 表，user_id 列隔离） */
export async function listPresets(userId: string): Promise<ModelPreset[]> {
  const rows = getDb()
    .prepare("SELECT * FROM model_presets WHERE user_id = ? ORDER BY created_at, rowid")
    .all(userId) as unknown as PresetRow[];
  return rows.map(toPreset);
}

export async function getPreset(userId: string, id: string): Promise<ModelPreset | undefined> {
  const row = getDb()
    .prepare("SELECT * FROM model_presets WHERE user_id = ? AND id = ?")
    .get(userId, id) as unknown as PresetRow | undefined;
  return row ? toPreset(row) : undefined;
}

export async function createPreset(
  userId: string,
  input: Omit<ModelPreset, "id" | "createdAt">
): Promise<ModelPreset> {
  const preset: ModelPreset = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      "INSERT INTO model_presets (id, user_id, name, model, base_url, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(preset.id, userId, preset.name, preset.model, preset.baseUrl, preset.apiKey, preset.createdAt);
  return preset;
}

export async function updatePreset(
  userId: string,
  id: string,
  patch: Partial<Omit<ModelPreset, "id" | "createdAt">>
): Promise<ModelPreset | undefined> {
  const existing = await getPreset(userId, id);
  if (!existing) return undefined;
  const next: ModelPreset = {
    ...existing,
    name: patch.name ?? existing.name,
    model: patch.model ?? existing.model,
    baseUrl: patch.baseUrl ?? existing.baseUrl,
    apiKey: patch.apiKey ?? existing.apiKey,
  };
  getDb()
    .prepare("UPDATE model_presets SET name = ?, model = ?, base_url = ?, api_key = ? WHERE user_id = ? AND id = ?")
    .run(next.name, next.model, next.baseUrl, next.apiKey, userId, id);
  return next;
}

export async function deletePreset(userId: string, id: string): Promise<boolean> {
  const result = getDb()
    .prepare("DELETE FROM model_presets WHERE user_id = ? AND id = ?")
    .run(userId, id);
  return result.changes > 0;
}

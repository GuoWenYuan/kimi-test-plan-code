import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { Pet, PetAppearance, PetExpression, PetMemory } from "@/lib/pet-types";

export type { Pet, PetAppearance, PetExpression, PetMemory };

/**
 * 电子宠物存储（SQLite pets 表，宠物池模型）。
 * - 宠物是全局实体：超管新增入池，owner_user_id 为 NULL 表示待领养；
 *   一宠一主（被领养后他人不可再领养），一人限领养一只（悬浮球单宠 UX）。
 * - 长期记忆存 pet_memories 表，由宠物聊天（PIAgent 精简）写入。
 * - 注：pets 表仍保留 hunger/mood/energy 等旧三围列（NOT NULL，写入时填 80），
 *   三围玩法已移除，代码不再读写，表情由前端随机轮播。
 */

interface PetRow {
  id: string;
  owner_user_id: string | null;
  name: string;
  preset_id: string | null;
  appearance: string;
  chat_session_id: string | null;
  adopted_at: string | null;
  created_at: string;
}

function parseAppearance(raw: string): PetAppearance {
  try {
    const parsed = JSON.parse(raw) as PetAppearance;
    return {
      expressions: parsed.expressions ?? {},
      stateMap: parsed.stateMap ?? {},
      prompts: parsed.prompts ?? {},
    };
  } catch {
    return { expressions: {}, stateMap: {}, prompts: {} };
  }
}

function toPet(r: PetRow, ownerName: string | null = null): Pet {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    ownerName,
    name: r.name,
    presetId: r.preset_id,
    appearance: parseAppearance(r.appearance),
    adoptedAt: r.adopted_at,
    createdAt: r.created_at,
  };
}

function getRow(id: string): PetRow | undefined {
  return getDb().prepare("SELECT * FROM pets WHERE id = ?").get(id) as unknown as
    | PetRow
    | undefined;
}

function getRowByOwner(userId: string): PetRow | undefined {
  return getDb().prepare("SELECT * FROM pets WHERE owner_user_id = ?").get(userId) as unknown as
    | PetRow
    | undefined;
}

function ownerNameOf(userId: string | null): string | null {
  if (!userId) return null;
  const row = getDb().prepare("SELECT username FROM users WHERE id = ?").get(userId) as
    | { username: string }
    | undefined;
  return row?.username ?? null;
}

// ---------- 查询 ----------

/** 宠物池全部宠物，按创建时间排序 */
export function listPets(): Pet[] {
  const rows = getDb().prepare("SELECT * FROM pets ORDER BY created_at ASC").all() as unknown as PetRow[];
  return rows.map((r) => toPet(r, ownerNameOf(r.owner_user_id)));
}

/** 按 id 读取宠物 */
export function getPetById(id: string): { pet: Pet } | null {
  const row = getRow(id);
  if (!row) return null;
  return { pet: toPet(row, ownerNameOf(row.owner_user_id)) };
}

/** 读取当前用户的宠物；未领养返回 null */
export function getMyPet(userId: string): { pet: Pet } | null {
  const raw = getRowByOwner(userId);
  if (!raw) return null;
  return getPetById(raw.id);
}

// ---------- 宠物池管理 ----------

/** 超管新增宠物入池（待领养） */
export function createPet(name: string): Pet {
  const trimmed = name.trim().slice(0, 12) || "新宠物";
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO pets (id, name, hunger, mood, energy, last_tick_at, created_at)
       VALUES (?, ?, 80, 80, 80, ?, ?)`
    )
    .run(id, trimmed, Date.now(), now);
  return toPet(getRow(id)!);
}

/**
 * 领养：宠物须未被领养，且用户当前无宠物（一人一宠）。
 * 条件 UPDATE 防并发抢领养。
 */
export function adoptPet(userId: string, petId: string, name?: string): { pet: Pet } | { error: string } {
  if (getRowByOwner(userId)) return { error: "你已经有一只宠物了" };
  const target = getRow(petId);
  if (!target) return { error: "宠物不存在" };
  const adoptedAt = new Date().toISOString();
  const result = getDb()
    .prepare("UPDATE pets SET owner_user_id = ?, adopted_at = ? WHERE id = ? AND owner_user_id IS NULL")
    .run(userId, adoptedAt, petId);
  if (result.changes === 0) return { error: "这只宠物已经被领养了" };
  const trimmed = name?.trim().slice(0, 12);
  if (trimmed) getDb().prepare("UPDATE pets SET name = ? WHERE id = ?").run(trimmed, petId);
  return { pet: toPet(getRow(petId)!, ownerNameOf(userId)) };
}

export function renamePet(userId: string, name: string): Pet | null {
  const trimmed = name.trim().slice(0, 12);
  if (!trimmed) return null;
  const mine = getRowByOwner(userId);
  if (!mine) return null;
  getDb().prepare("UPDATE pets SET name = ? WHERE id = ?").run(trimmed, mine.id);
  return getPetById(mine.id)?.pet ?? null;
}

/** 更新宠物设置（模型预设 / 外观）；调用方需已完成 owner 或超管校验 */
export function updatePetSettings(
  petId: string,
  patch: { presetId?: string | null; appearance?: PetAppearance; name?: string }
): Pet | null {
  const row = getRow(petId);
  if (!row) return null;
  if (patch.presetId !== undefined) {
    getDb().prepare("UPDATE pets SET preset_id = ? WHERE id = ?").run(patch.presetId, petId);
  }
  if (patch.appearance !== undefined) {
    getDb()
      .prepare("UPDATE pets SET appearance = ? WHERE id = ?")
      .run(JSON.stringify(patch.appearance), petId);
  }
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim().slice(0, 12);
    if (trimmed) getDb().prepare("UPDATE pets SET name = ? WHERE id = ?").run(trimmed, petId);
  }
  return getPetById(petId)?.pet ?? null;
}

// ---------- 聊天会话 ----------

/** 读取宠物的 pi 会话 id；没有则生成并落库（pi 按 cwd + sessionId 归档，实现多轮连续） */
export function ensureChatSessionId(petId: string): string {
  const row = getRow(petId);
  if (!row) throw new Error("宠物不存在");
  if (row.chat_session_id) return row.chat_session_id;
  const sid = randomUUID();
  getDb().prepare("UPDATE pets SET chat_session_id = ? WHERE id = ?").run(sid, petId);
  return sid;
}

/**
 * 清空聊天会话：置空 chat_session_id（下次对话开新会话），
 * 返回旧会话 id 供调用方删除 pi 侧缓存的会话历史文件；无会话返回 null。
 */
export function clearChatSession(petId: string): string | null {
  const row = getRow(petId);
  if (!row) return null;
  const old = row.chat_session_id;
  if (old) getDb().prepare("UPDATE pets SET chat_session_id = NULL WHERE id = ?").run(petId);
  return old;
}

// ---------- 长期记忆 ----------

export function listMemories(petId: string): PetMemory[] {
  const rows = getDb()
    .prepare("SELECT id, content, created_at FROM pet_memories WHERE pet_id = ? ORDER BY created_at ASC")
    .all(petId) as unknown as { id: string; content: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.created_at }));
}

/** 写入一条记忆；与现有记忆完全相同则跳过（返回 null） */
export function addMemory(petId: string, content: string): PetMemory | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const existing = listMemories(petId);
  if (existing.some((m) => m.content === trimmed)) return null;
  const memory: PetMemory = { id: randomUUID(), content: trimmed, createdAt: new Date().toISOString() };
  getDb()
    .prepare("INSERT INTO pet_memories (id, pet_id, content, created_at) VALUES (?, ?, ?, ?)")
    .run(memory.id, petId, memory.content, memory.createdAt);
  return memory;
}

export function deleteMemory(petId: string, memoryId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM pet_memories WHERE id = ? AND pet_id = ?")
    .run(memoryId, petId);
  return result.changes > 0;
}

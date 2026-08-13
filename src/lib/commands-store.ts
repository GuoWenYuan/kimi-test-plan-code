import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export type CommandTarget = "local" | "server";

export interface QuickCommand {
  id: string;
  /** 指令名称，如 "查看磁盘占用" */
  name: string;
  /** shell 指令内容 */
  command: string;
  /** 执行目标：local = 浏览器直连本机统一桥（workbench-bridge）；server = workbench 容器内 shell（仅超管可执行） */
  target: CommandTarget;
  /** 超时秒数（1-300） */
  timeout: number;
  createdAt: string;
}

interface CommandRow {
  id: string;
  user_id: string;
  name: string;
  command: string;
  target: string;
  timeout: number;
  created_at: string;
}

function normalizeTarget(t: unknown): CommandTarget {
  return t === "server" ? "server" : "local";
}

function clampTimeout(t: unknown): number {
  const n = Number(t);
  if (!Number.isFinite(n)) return 60;
  return Math.min(300, Math.max(1, Math.round(n)));
}

function toCommand(r: CommandRow): QuickCommand {
  return {
    id: r.id,
    name: r.name,
    command: r.command,
    target: normalizeTarget(r.target),
    timeout: r.timeout,
    createdAt: r.created_at,
  };
}

/** 快捷指令按用户隔离存储（SQLite quick_commands 表，user_id 列隔离） */
export async function listCommands(userId: string): Promise<QuickCommand[]> {
  const rows = getDb()
    .prepare("SELECT * FROM quick_commands WHERE user_id = ? ORDER BY created_at, rowid")
    .all(userId) as unknown as CommandRow[];
  return rows.map(toCommand);
}

export async function getCommand(userId: string, id: string): Promise<QuickCommand | undefined> {
  const row = getDb()
    .prepare("SELECT * FROM quick_commands WHERE user_id = ? AND id = ?")
    .get(userId, id) as unknown as CommandRow | undefined;
  return row ? toCommand(row) : undefined;
}

export async function createCommand(
  userId: string,
  input: Omit<QuickCommand, "id" | "createdAt">
): Promise<QuickCommand> {
  const command: QuickCommand = {
    ...input,
    target: normalizeTarget(input.target),
    timeout: clampTimeout(input.timeout),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      "INSERT INTO quick_commands (id, user_id, name, command, target, timeout, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(command.id, userId, command.name, command.command, command.target, command.timeout, command.createdAt);
  return command;
}

export async function updateCommand(
  userId: string,
  id: string,
  patch: Partial<Omit<QuickCommand, "id" | "createdAt">>
): Promise<QuickCommand | undefined> {
  const existing = await getCommand(userId, id);
  if (!existing) return undefined;
  const next: QuickCommand = {
    ...existing,
    name: patch.name ?? existing.name,
    command: patch.command ?? existing.command,
    target: patch.target !== undefined ? normalizeTarget(patch.target) : existing.target,
    timeout: patch.timeout !== undefined ? clampTimeout(patch.timeout) : existing.timeout,
  };
  getDb()
    .prepare("UPDATE quick_commands SET name = ?, command = ?, target = ?, timeout = ? WHERE user_id = ? AND id = ?")
    .run(next.name, next.command, next.target, next.timeout, userId, id);
  return next;
}

export async function deleteCommand(userId: string, id: string): Promise<boolean> {
  const result = getDb()
    .prepare("DELETE FROM quick_commands WHERE user_id = ? AND id = ?")
    .run(userId, id);
  return result.changes > 0;
}

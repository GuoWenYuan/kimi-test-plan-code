import crypto from "node:crypto";
import { getDb } from "@/lib/db";

/**
 * 用户 / Session 存储（SQLite，见 src/lib/db.ts）。
 * 注意：密码按客户要求明文存储（管理员需要可查看密码），
 * 这只是按需求的演示实现，生产环境必须改为哈希存储。
 */

export type Role = "super_admin" | "user";

export interface User {
  id: string;
  username: string;
  /** 明文密码 —— 按需求演示实现，生产环境请勿明文存储 */
  password: string;
  role: Role;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

interface UserRow {
  id: string;
  username: string;
  password: string;
  role: string;
  created_at: string;
}

interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
}

function toUser(r: UserRow): User {
  return { id: r.id, username: r.username, password: r.password, role: r.role as Role, createdAt: r.created_at };
}

// ---------- 用户 ----------

export function listUsers(): User[] {
  const rows = getDb().prepare("SELECT * FROM users ORDER BY created_at, rowid").all() as unknown as UserRow[];
  return rows.map(toUser);
}

/** 首次启动时种子创建默认超级管理员 */
export function seedSuperAdmin(): void {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM users WHERE username = ?").get("guowenyuan");
  if (exists) return;
  db.prepare("INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    "guowenyuan",
    "030501", // 明文：按需求演示实现
    "super_admin",
    new Date().toISOString(),
  );
}

export function findUserByUsername(username: string): User | undefined {
  const row = getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as unknown as UserRow | undefined;
  return row ? toUser(row) : undefined;
}

export function findUserById(id: string): User | undefined {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow | undefined;
  return row ? toUser(row) : undefined;
}

export function createUser(input: { username: string; password: string; role: Role }): User {
  const user: User = {
    id: crypto.randomUUID(),
    username: input.username,
    password: input.password,
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare("INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(user.id, user.username, user.password, user.role, user.createdAt);
  return user;
}

export function updateUser(id: string, patch: { password?: string; role?: Role }): User | undefined {
  const db = getDb();
  const existing = findUserById(id);
  if (!existing) return undefined;
  const password = patch.password ?? existing.password;
  const role = patch.role ?? existing.role;
  db.prepare("UPDATE users SET password = ?, role = ? WHERE id = ?").run(password, role, id);
  return { ...existing, password, role };
}

/** 删除用户，同时清理其模型预设、知识库笔记与 session */
export function deleteUser(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  if (result.changes === 0) return false;
  db.prepare("DELETE FROM model_presets WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM knowledge_notes WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  return true;
}

// ---------- Session ----------

export function listSessions(): Session[] {
  const rows = getDb().prepare("SELECT * FROM sessions").all() as unknown as SessionRow[];
  return rows.map((r) => ({ token: r.token, userId: r.user_id, createdAt: r.created_at }));
}

export function createSession(userId: string): Session {
  const db = getDb();
  // 顺手清理过期 session
  db.prepare("DELETE FROM sessions WHERE created_at < ?").run(Date.now() - SESSION_TTL_MS);
  const session: Session = { token: crypto.randomUUID(), userId, createdAt: Date.now() };
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
    session.token,
    session.userId,
    session.createdAt,
  );
  return session;
}

export function findSession(token: string): Session | undefined {
  const row = getDb().prepare("SELECT * FROM sessions WHERE token = ?").get(token) as unknown as
    | SessionRow
    | undefined;
  if (!row) return undefined;
  if (Date.now() - row.created_at >= SESSION_TTL_MS) return undefined;
  return { token: row.token, userId: row.user_id, createdAt: row.created_at };
}

export function deleteSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

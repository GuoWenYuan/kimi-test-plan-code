import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * 基于项目内 data/ 目录 JSON 文件的极简持久化存储。
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

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const KEYS_FILE = path.join(DATA_DIR, "api-keys.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

// ---------- 用户 ----------

export function listUsers(): User[] {
  return readJson<User[]>(USERS_FILE, []);
}

function saveUsers(users: User[]): void {
  writeJson(USERS_FILE, users);
}

/** 首次启动时种子创建默认超级管理员 */
export function seedSuperAdmin(): void {
  const users = listUsers();
  if (users.some((u) => u.username === "guowenyuan")) return;
  users.push({
    id: crypto.randomUUID(),
    username: "guowenyuan",
    password: "030501", // 明文：按需求演示实现
    role: "super_admin",
    createdAt: new Date().toISOString(),
  });
  saveUsers(users);
}

export function findUserByUsername(username: string): User | undefined {
  return listUsers().find((u) => u.username === username);
}

export function findUserById(id: string): User | undefined {
  return listUsers().find((u) => u.id === id);
}

export function createUser(input: { username: string; password: string; role: Role }): User {
  const users = listUsers();
  const user: User = {
    id: crypto.randomUUID(),
    username: input.username,
    password: input.password,
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

export function updateUser(id: string, patch: { password?: string; role?: Role }): User | undefined {
  const users = listUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return undefined;
  if (patch.password !== undefined) user.password = patch.password;
  if (patch.role !== undefined) user.role = patch.role;
  saveUsers(users);
  return user;
}

/** 删除用户，同时清理其 API Key 与 session */
export function deleteUser(id: string): boolean {
  const users = listUsers();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  saveUsers(next);
  writeJson(KEYS_FILE, listKeys().filter((k) => k.userId !== id));
  writeJson(SESSIONS_FILE, listSessions().filter((s) => s.userId !== id));
  return true;
}

// ---------- API Key ----------

export function listKeys(): ApiKey[] {
  return readJson<ApiKey[]>(KEYS_FILE, []);
}

function saveKeys(keys: ApiKey[]): void {
  writeJson(KEYS_FILE, keys);
}

export function listKeysByUser(userId: string): ApiKey[] {
  return listKeys().filter((k) => k.userId === userId);
}

export function createKey(input: { userId: string; name: string; baseUrl: string; apiKey: string }): ApiKey {
  const keys = listKeys();
  const key: ApiKey = {
    id: crypto.randomUUID(),
    userId: input.userId,
    name: input.name,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    createdAt: new Date().toISOString(),
  };
  keys.push(key);
  saveKeys(keys);
  return key;
}

export function updateKey(
  id: string,
  patch: { name?: string; baseUrl?: string; apiKey?: string },
): ApiKey | undefined {
  const keys = listKeys();
  const key = keys.find((k) => k.id === id);
  if (!key) return undefined;
  if (patch.name !== undefined) key.name = patch.name;
  if (patch.baseUrl !== undefined) key.baseUrl = patch.baseUrl;
  if (patch.apiKey !== undefined) key.apiKey = patch.apiKey;
  saveKeys(keys);
  return key;
}

export function deleteKey(id: string): ApiKey | undefined {
  const keys = listKeys();
  const key = keys.find((k) => k.id === id);
  if (!key) return undefined;
  saveKeys(keys.filter((k) => k.id !== id));
  return key;
}

// ---------- Session ----------

export function listSessions(): Session[] {
  return readJson<Session[]>(SESSIONS_FILE, []);
}

export function createSession(userId: string): Session {
  const sessions = listSessions().filter((s) => Date.now() - s.createdAt < SESSION_TTL_MS);
  const session: Session = { token: crypto.randomUUID(), userId, createdAt: Date.now() };
  sessions.push(session);
  writeJson(SESSIONS_FILE, sessions);
  return session;
}

export function findSession(token: string): Session | undefined {
  const session = listSessions().find((s) => s.token === token);
  if (!session) return undefined;
  if (Date.now() - session.createdAt >= SESSION_TTL_MS) return undefined;
  return session;
}

export function deleteSession(token: string): void {
  writeJson(SESSIONS_FILE, listSessions().filter((s) => s.token !== token));
}

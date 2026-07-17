import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * 用户系统：注册/登录 + 签名 Cookie 会话。
 * 存储在 data/（gitignore 保护），密码 scrypt 加盐哈希，不存明文。
 */

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const SESSION_COOKIE = "wb_session";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

async function readUsers(): Promise<User[]> {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, "utf-8")) as User[];
  } catch {
    return [];
  }
}

async function writeUsers(list: User[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(list, null, 2), "utf-8");
}

async function getSecret(): Promise<string> {
  try {
    return (await fs.readFile(SECRET_FILE, "utf-8")).trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("hex");
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SECRET_FILE, secret, "utf-8");
    return secret;
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function registerUser(
  username: string,
  password: string
): Promise<{ user?: User; error?: string; isFirst?: boolean }> {
  const name = username.trim();
  if (!name || name.length < 2) return { error: "用户名至少 2 个字符" };
  if (!password || password.length < 6) return { error: "密码至少 6 位" };
  const users = await readUsers();
  if (users.some((u) => u.username === name)) return { error: "用户名已存在" };
  const salt = crypto.randomBytes(16).toString("hex");
  const user: User = {
    id: crypto.randomUUID(),
    username: name,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return { user, isFirst: users.length === 1 };
}

export async function verifyUser(username: string, password: string): Promise<User | null> {
  const users = await readUsers();
  const user = users.find((u) => u.username === username.trim());
  if (!user) return null;
  const hash = hashPassword(password, user.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.passwordHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? user : null;
}

export async function getUserById(id: string): Promise<User | null> {
  return (await readUsers()).find((u) => u.id === id) ?? null;
}

/** 生成会话 Cookie 值：userId.signature */
export async function createSessionValue(userId: string): Promise<string> {
  const secret = await getSecret();
  return `${userId}.${sign(userId, secret)}`;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

/** 从请求中解析当前用户；无效或缺失返回 null */
export async function getCurrentUser(req: Request): Promise<User | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const [userId, sig] = decodeURIComponent(match[1]).split(".");
  if (!userId || !sig) return null;
  const secret = await getSecret();
  const expected = sign(userId, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return getUserById(userId);
}

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

/**
 * 统一 SQLite 存储层（Node 内置 node:sqlite，零原生依赖）。
 * - 数据库文件路径由环境变量 DATABASE_PATH 指定，默认项目内 data/app.db
 * - 建表 DDL 在首次连接时幂等执行（CREATE TABLE IF NOT EXISTS）
 * - 首次启动时若发现旧 JSON 数据文件（data/*.json、data/users/）且对应表为空，
 *   自动导入并把旧文件重命名为 *.migrated.bak（不删除）
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  -- 明文密码：按客户明确要求（管理员需可查看密码）的演示实现，生产环境应改为哈希
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_notes (
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (user_id, slug)
);
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  grp TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_groups (
  name TEXT PRIMARY KEY
);
-- 宠物池：全局实体，owner_user_id 为 NULL 表示待领养；一宠一主，被领养后他人不可再领养
CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  name TEXT NOT NULL,
  -- 主人为宠物选择的模型预设（宠物聊天用，主人自己的 key）
  preset_id TEXT,
  -- 外观 JSON：{ expressions: Record<表情名, 文件名>, stateMap: { idle?, hungry?, sleepy?, eating?, petted? }, prompts: Record<文件名, 累积生成描述> }
  -- 资源文件存 data/pets/<id>/assets/，无映射时回退内置 public/pet/*.png
  appearance TEXT NOT NULL DEFAULT '{}',
  -- pi 多轮会话 id（pi 按 cwd + sessionId 归档，工作区 data/pets/<id>/workspace）
  chat_session_id TEXT,
  -- 三围 0-100：饱食/心情/精力，按真实时间衰减，读取时结算
  hunger REAL NOT NULL,
  mood REAL NOT NULL,
  energy REAL NOT NULL,
  last_tick_at INTEGER NOT NULL,
  -- 各互动上次成功时间（ms），服务端冷却用
  feed_at INTEGER NOT NULL DEFAULT 0,
  pet_at INTEGER NOT NULL DEFAULT 0,
  play_at INTEGER NOT NULL DEFAULT 0,
  last_daily_bonus_at INTEGER NOT NULL DEFAULT 0,
  adopted_at TEXT,
  created_at TEXT NOT NULL
);
-- 宠物长期记忆：用户说"记住…"时经 PIAgent 精简后入库，对话时自动注入
CREATE TABLE IF NOT EXISTS pet_memories (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- 远程设备：各机器 device-agent 心跳上报的本机工具清单，供 /tools 页远程打开（手机等外端）
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- JSON: [{toolId?, label, localPort, remoteUrl, token?, online}]
  endpoints TEXT NOT NULL DEFAULT '[]',
  last_seen INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);
-- 快捷指令：按用户隔离的预设 shell 指令；target = local（本机统一桥 workbench-bridge）/ server（workbench 容器，仅超管可执行）
CREATE TABLE IF NOT EXISTS quick_commands (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'local',
  timeout INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL
);
-- 宠物定时任务：cron 到点后以宠物人设跑 PIAgent，结果回流给主人（notified_at 汇报标记）
CREATE TABLE IF NOT EXISTS pet_tasks (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_result TEXT,
  notified_at INTEGER,
  created_at TEXT NOT NULL
);
`;

// ---------- 旧 JSON 一次性迁移 ----------

function readJsonFile(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function tableCount(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

/** 导入成功后把旧文件改名为 .migrated.bak（保留备份，不删除） */
function markMigrated(file: string): void {
  try {
    fs.renameSync(file, `${file}.migrated.bak`);
  } catch (e) {
    console.error(`[db] 重命名旧数据文件失败 ${file}:`, e);
  }
}

function migrateUsersJson(db: DatabaseSync): void {
  const file = path.join(DATA_DIR, "users.json");
  if (!fs.existsSync(file) || tableCount(db, "users") > 0) return;
  const rows = readJsonFile(file);
  if (!Array.isArray(rows)) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  let skipped = 0;
  for (const r of rows as Record<string, unknown>[]) {
    // 仅导入新系统的明文密码格式；更早期 scrypt 哈希格式无法还原明文，跳过并告警
    if (typeof r?.id === "string" && typeof r?.username === "string" && typeof r?.password === "string") {
      stmt.run(r.id, r.username, r.password, String(r.role ?? "user"), String(r.createdAt ?? new Date().toISOString()));
    } else {
      skipped++;
    }
  }
  if (skipped > 0) console.warn(`[db] users.json 中 ${skipped} 条旧格式（哈希密码）记录被跳过，需重建这些用户`);
  markMigrated(file);
  console.log(`[db] 已从 users.json 迁移用户数据`);
}

function migrateSessionsJson(db: DatabaseSync): void {
  const file = path.join(DATA_DIR, "sessions.json");
  if (!fs.existsSync(file) || tableCount(db, "sessions") > 0) return;
  const rows = readJsonFile(file);
  if (!Array.isArray(rows)) return;
  const stmt = db.prepare("INSERT OR IGNORE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)");
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.token === "string" && typeof r?.userId === "string") {
      stmt.run(r.token, r.userId, Number(r.createdAt ?? Date.now()));
    }
  }
  markMigrated(file);
  console.log(`[db] 已从 sessions.json 迁移会话数据`);
}

function migratePromptsJson(db: DatabaseSync): void {
  const file = path.join(DATA_DIR, "prompts.json");
  if (!fs.existsSync(file) || tableCount(db, "prompt_groups") > 0 || tableCount(db, "prompt_templates") > 0) return;
  const parsed = readJsonFile(file);
  if (parsed === null) return;
  // 兼容两种旧格式：{groups, templates} 或纯模板数组
  const data = Array.isArray(parsed)
    ? { groups: ["默认", "程序", "写作"], templates: parsed }
    : (parsed as { groups?: unknown; templates?: unknown });
  const gStmt = db.prepare("INSERT OR IGNORE INTO prompt_groups (name) VALUES (?)");
  for (const g of (Array.isArray(data.groups) ? data.groups : []) as unknown[]) {
    if (typeof g === "string" && g) gStmt.run(g);
  }
  const tStmt = db.prepare(
    "INSERT OR IGNORE INTO prompt_templates (id, name, description, content, grp, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const t of (Array.isArray(data.templates) ? data.templates : []) as Record<string, unknown>[]) {
    if (typeof t?.id === "string") {
      tStmt.run(t.id, String(t.name ?? ""), String(t.description ?? ""), String(t.content ?? ""), String(t.group ?? "默认") || "默认", String(t.createdAt ?? new Date().toISOString()));
    }
  }
  markMigrated(file);
  console.log(`[db] 已从 prompts.json 迁移提示词数据`);
}

function listMdFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMdFiles(full));
    else if (e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

/** 迁移 data/users/<userId>/ 下的模型预设与知识库笔记 */
function migrateUsersDir(db: DatabaseSync): void {
  const dir = path.join(DATA_DIR, "users");
  if (!fs.existsSync(dir)) return;
  let migratedSomething = false;

  let userDirs: fs.Dirent[] = [];
  try {
    userDirs = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ud of userDirs) {
    if (!ud.isDirectory()) continue;
    const userId = ud.name;

    // 模型预设
    const modelsFile = path.join(dir, userId, "models.json");
    if (fs.existsSync(modelsFile)) {
      const rows = readJsonFile(modelsFile);
      if (Array.isArray(rows)) {
        const stmt = db.prepare(
          "INSERT OR IGNORE INTO model_presets (id, user_id, name, model, base_url, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        for (const r of rows as Record<string, unknown>[]) {
          if (typeof r?.id === "string") {
            stmt.run(r.id, userId, String(r.name ?? ""), String(r.model ?? ""), String(r.baseUrl ?? ""), String(r.apiKey ?? ""), String(r.createdAt ?? new Date().toISOString()));
          }
        }
        migratedSomething = true;
      }
    }

    // 知识库笔记（.md 文件树）
    const kbDir = path.join(dir, userId, "knowledge");
    const mdFiles = listMdFiles(kbDir);
    if (mdFiles.length > 0) {
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO knowledge_notes (user_id, slug, content) VALUES (?, ?, ?)"
      );
      for (const f of mdFiles) {
        const slug = path.relative(kbDir, f).replace(/\\/g, "/").replace(/\.md$/i, "");
        try {
          stmt.run(userId, slug, fs.readFileSync(f, "utf-8"));
          migratedSomething = true;
        } catch {
          // 单个文件失败不中断
        }
      }
    }
  }

  if (migratedSomething) {
    markMigrated(dir);
    console.log(`[db] 已从 data/users/ 迁移模型预设与知识库数据`);
  }
}

function migrateFromJson(db: DatabaseSync): void {
  try {
    migrateUsersJson(db);
    migrateSessionsJson(db);
    migratePromptsJson(db);
    migrateUsersDir(db);
  } catch (e) {
    // 迁移失败不阻断启动（数据仍在旧 JSON 备份中）
    console.error("[db] 旧 JSON 数据迁移失败：", e);
  }
}

// ---------- 连接单例 ----------

/**
 * 旧 pets 表（user_id 主键，一人一宠）迁移为宠物池结构（id 主键 + owner_user_id）。
 * 在 exec(DDL) 前把旧表改名让新表建出来，之后拷贝数据并删除旧表。幂等。
 */
function migrateLegacyPets(conn: DatabaseSync, phase: "before" | "after"): void {
  const legacy = conn
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pets'")
    .get() as { name: string } | undefined;
  const oldCopy = conn
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pets_legacy'")
    .get() as { name: string } | undefined;

  if (phase === "before") {
    if (!legacy) return;
    const cols = conn.prepare("PRAGMA table_info(pets)").all() as { name: string }[];
    if (cols.some((c) => c.name === "id")) return; // 已是新结构
    conn.exec("ALTER TABLE pets RENAME TO pets_legacy");
    return;
  }

  if (!oldCopy) return;
  const rows = conn.prepare("SELECT * FROM pets_legacy").all() as Record<string, unknown>[];
  const stmt = conn.prepare(
    `INSERT OR IGNORE INTO pets
       (id, owner_user_id, name, hunger, mood, energy, last_tick_at,
        feed_at, pet_at, play_at, last_daily_bonus_at, adopted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  for (const r of rows) {
    stmt.run(
      randomUUID(),
      String(r.user_id ?? ""),
      String(r.name ?? "YOYO"),
      Number(r.hunger ?? 80),
      Number(r.mood ?? 80),
      Number(r.energy ?? 80),
      Number(r.last_tick_at ?? Date.now()),
      Number(r.feed_at ?? 0),
      Number(r.pet_at ?? 0),
      Number(r.play_at ?? 0),
      Number(r.last_daily_bonus_at ?? 0),
      String(r.adopted_at ?? now),
      now
    );
  }
  conn.exec("DROP TABLE pets_legacy");
  console.log(`[db] 已将 ${rows.length} 只旧宠物迁移到宠物池结构`);
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const conn = new DatabaseSync(DB_PATH);
  conn.exec("PRAGMA journal_mode=WAL;");
  migrateLegacyPets(conn, "before");
  conn.exec(DDL);
  // 幂等补列：pet_tasks 支持间隔型任务（NULL = cron 任务）
  try {
    conn.exec("ALTER TABLE pet_tasks ADD COLUMN interval_minutes INTEGER");
  } catch {
    // 列已存在
  }
  // 幂等补列：一次性任务的绝对触发时间（ms），执行后自动停用
  try {
    conn.exec("ALTER TABLE pet_tasks ADD COLUMN run_at INTEGER");
  } catch {
    // 列已存在
  }
  migrateLegacyPets(conn, "after");
  migrateFromJson(conn);
  db = conn;
  return conn;
}

import fs from "node:fs";
import path from "node:path";
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
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  graph TEXT NOT NULL,
  created_at TEXT NOT NULL
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
CREATE TABLE IF NOT EXISTS custom_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tag TEXT NOT NULL,
  mode TEXT NOT NULL,
  content TEXT NOT NULL,
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

function migrateApiKeysJson(db: DatabaseSync): void {
  const file = path.join(DATA_DIR, "api-keys.json");
  if (!fs.existsSync(file) || tableCount(db, "api_keys") > 0) return;
  const rows = readJsonFile(file);
  if (!Array.isArray(rows)) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO api_keys (id, user_id, name, base_url, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.id === "string" && typeof r?.userId === "string") {
      stmt.run(r.id, r.userId, String(r.name ?? ""), String(r.baseUrl ?? ""), String(r.apiKey ?? ""), String(r.createdAt ?? new Date().toISOString()));
    }
  }
  markMigrated(file);
  console.log(`[db] 已从 api-keys.json 迁移 API Key 数据`);
}

function migrateWorkflowsJson(db: DatabaseSync): void {
  const file = path.join(DATA_DIR, "workflows.json");
  if (!fs.existsSync(file) || tableCount(db, "workflows") > 0) return;
  const rows = readJsonFile(file);
  if (!Array.isArray(rows)) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO workflows (id, name, tag, graph, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.id === "string") {
      stmt.run(r.id, String(r.name ?? ""), String(r.tag ?? "默认") || "默认", JSON.stringify(r.graph ?? { nodes: [], edges: [], knowledge: "" }), String(r.createdAt ?? new Date().toISOString()));
    }
  }
  markMigrated(file);
  console.log(`[db] 已从 workflows.json 迁移工作流数据`);
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

function migrateCustomNodesJson(db: DatabaseSync): void {
  const file = path.join(DATA_DIR, "custom-nodes.json");
  if (!fs.existsSync(file) || tableCount(db, "custom_nodes") > 0) return;
  const rows = readJsonFile(file);
  if (!Array.isArray(rows)) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO custom_nodes (id, name, description, tag, mode, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.id === "string") {
      stmt.run(r.id, String(r.name ?? ""), String(r.description ?? ""), String(r.tag ?? "默认") || "默认", String(r.mode ?? "llm"), String(r.content ?? ""), String(r.createdAt ?? new Date().toISOString()));
    }
  }
  markMigrated(file);
  console.log(`[db] 已从 custom-nodes.json 迁移自定义节点数据`);
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
    migrateApiKeysJson(db);
    migrateWorkflowsJson(db);
    migratePromptsJson(db);
    migrateCustomNodesJson(db);
    migrateUsersDir(db);
  } catch (e) {
    // 迁移失败不阻断启动（数据仍在旧 JSON 备份中）
    console.error("[db] 旧 JSON 数据迁移失败：", e);
  }
}

// ---------- 连接单例 ----------

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const conn = new DatabaseSync(DB_PATH);
  conn.exec("PRAGMA journal_mode=WAL;");
  conn.exec(DDL);
  migrateFromJson(conn);
  db = conn;
  return conn;
}

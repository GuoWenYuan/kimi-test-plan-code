import fs from "node:fs";
import path from "node:path";

/**
 * Token 用量统计：扫描本服务器 pi-service 的会话归档（data/pi-agent/sessions/**.jsonl），
 * 按模型聚合每天/最近 24h 的输入、输出、缓存读取、缓存创建 token。
 * 与 kimi-code-monitor 扩展扫描本地 CLI wire.jsonl 同一思路，只是数据源换成服务器上的 pi 会话。
 *
 * 口径（与扩展一致）：总输入 = 未缓存输入 + 缓存读取 + 缓存创建；缓存命中率 = 缓存读取 ÷ 总输入。
 * pi 会话行格式：{"type":"message","timestamp":...,"message":{"role":"assistant","model":...,"usage":{input,output,cacheRead,cacheWrite,...}}}
 */

export interface TokenBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelTokenStats {
  h24: TokenBucket;
  d7: TokenBucket;
  d30: TokenBucket;
}

const SESSIONS_DIR = path.join(process.cwd(), "data", "pi-agent", "sessions");
const CACHE_TTL_MS = 60_000;

interface ModelRecord {
  days: Map<string, TokenBucket>;
  h24: TokenBucket;
}

interface ScanResult {
  perModel: Map<string, ModelRecord>;
  scannedAt: number;
}

let cache: ScanResult | null = null;

function emptyBucket(): TokenBucket {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function addTo(bucket: TokenBucket, usage: Record<string, unknown>): void {
  bucket.input += Number(usage.input) || 0;
  bucket.output += Number(usage.output) || 0;
  bucket.cacheRead += Number(usage.cacheRead) || 0;
  bucket.cacheWrite += Number(usage.cacheWrite) || 0;
}

/** 服务器本地时区的 YYYY-MM-DD，字典序即时间序 */
function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function scan(): ScanResult {
  if (cache && Date.now() - cache.scannedAt < CACHE_TTL_MS) return cache;
  const perModel = new Map<string, ModelRecord>();
  const now = Date.now();
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(SESSIONS_DIR);
  } catch {
    // 目录不存在（未跑过 PIAgent）按无数据处理
  }
  for (const dir of dirs) {
    const dirPath = path.join(SESSIONS_DIR, dir);
    let files: string[];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      let content: string;
      try {
        content = fs.readFileSync(path.join(dirPath, file), "utf8");
      } catch {
        continue;
      }
      for (const line of content.split("\n")) {
        // 快速预筛，避免对每行 JSON.parse
        if (!line.startsWith('{"type":"message"') || !line.includes('"usage"')) continue;
        let entry: {
          timestamp?: string;
          message?: { role?: string; model?: unknown; timestamp?: string; usage?: Record<string, unknown> };
        };
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        const msg = entry?.message;
        if (msg?.role !== "assistant" || !msg.usage) continue;
        const ts = Date.parse(entry.timestamp ?? msg.timestamp ?? "");
        if (!Number.isFinite(ts)) continue;
        const model = typeof msg.model === "string" && msg.model ? msg.model : "unknown";
        let rec = perModel.get(model);
        if (!rec) {
          rec = { days: new Map(), h24: emptyBucket() };
          perModel.set(model, rec);
        }
        const key = dayKey(ts);
        let bucket = rec.days.get(key);
        if (!bucket) {
          bucket = emptyBucket();
          rec.days.set(key, bucket);
        }
        addTo(bucket, msg.usage);
        if (now - ts < 24 * 3_600_000) addTo(rec.h24, msg.usage);
      }
    }
  }
  cache = { perModel, scannedAt: now };
  return cache;
}

function sumLastDays(days: Map<string, TokenBucket>, n: number): TokenBucket {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (n - 1));
  const cutoffKey = dayKey(cutoff.getTime());
  const total = emptyBucket();
  for (const [key, bucket] of days) {
    if (key < cutoffKey) continue;
    total.input += bucket.input;
    total.output += bucket.output;
    total.cacheRead += bucket.cacheRead;
    total.cacheWrite += bucket.cacheWrite;
  }
  return total;
}

/** 取某个模型（预设 model 字段，如 deepseek-v4-flash）的 token 用量；无记录返回 null */
export function getModelTokenStats(model: string): ModelTokenStats | null {
  const rec = scan().perModel.get(model);
  if (!rec) return null;
  return { h24: rec.h24, d7: sumLastDays(rec.days, 7), d30: sumLastDays(rec.days, 30) };
}

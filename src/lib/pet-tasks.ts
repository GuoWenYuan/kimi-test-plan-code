import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getPreset } from "@/lib/models-store";
import { acquirePetBusy, isPetBusy } from "@/lib/pet-busy";
import { buildPetMessage, petWorkspaceDir } from "@/lib/pet-chat";
import { ensureChatSessionId, getPetById } from "@/lib/pet-store";
import { notifyTaskResult } from "@/lib/pet-notify";
import { runPiChatCollect } from "@/lib/pi-runner";
import fs from "node:fs";

/**
 * 宠物定时任务：三种触发方式（三选一）——
 * 1. cron 五段表达式（分 时 日 月 周，服务器本地时区，日月周为 AND 语义），日历周期重复；
 * 2. interval_minutes 纯间隔（每隔 N 分钟跑一次，适合 cron 表达不了的"每 90 分钟/每 3 天"），重复；
 * 3. run_at 一次性绝对时间（"1 分钟后提醒我"），执行一次后自动停用。
 * 到点后以宠物人设 + 主人预设 + 宠物工作区跑一轮 PIAgent，
 * 结果写回任务行，等主人下次拉宠物状态时由悬浮球"汇报"。
 * 调度器为主应用进程内循环（懒启动单例，30s 一拍），任务状态全部落库，重启后从库恢复。
 */

export interface PetTask {
  id: string;
  petId: string;
  name: string;
  prompt: string;
  cron: string;
  /** 间隔分钟数；非 null 时为间隔任务（cron 字段为空串） */
  intervalMinutes: number | null;
  /** 一次性任务的绝对触发时间（ms）；非 null 时为一次性任务，执行后自动停用 */
  runAt: number | null;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: "ok" | "error" | null;
  lastResult: string | null;
  createdAt: string;
}

export interface PetTaskNotice {
  taskName: string;
  status: "ok" | "error";
  result: string;
  ranAt: number;
}

interface TaskRow {
  id: string;
  pet_id: string;
  name: string;
  prompt: string;
  cron: string;
  interval_minutes: number | null;
  run_at: number | null;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
  last_status: string | null;
  last_result: string | null;
  notified_at: number | null;
  created_at: string;
}

const RESULT_MAX = 2000;
const TICK_MS = 30_000;
/** 间隔任务的合法范围：1 分钟 ~ 7 天 */
export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 7 * 24 * 60;

function toTask(r: TaskRow): PetTask {
  return {
    id: r.id,
    petId: r.pet_id,
    name: r.name,
    prompt: r.prompt,
    cron: r.cron,
    intervalMinutes: r.interval_minutes ?? null,
    runAt: r.run_at ?? null,
    enabled: r.enabled === 1,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    lastStatus: (r.last_status as PetTask["lastStatus"]) ?? null,
    lastResult: r.last_result,
    createdAt: r.created_at,
  };
}

// ---------- cron 解析（五段：分 时 日 月 周；支持 * , - / 数字） ----------

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part.trim());
    if (!m) return null;
    let lo: number;
    let hi: number;
    if (m[1] === "*") {
      lo = min;
      hi = max;
    } else {
      lo = Number(m[1]);
      hi = m[2] !== undefined ? Number(m[2]) : lo;
    }
    const step = m[3] !== undefined ? Number(m[3]) : 1;
    if (step <= 0 || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size > 0 ? out : null;
}

interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
}

export function parseCron(expr: string): CronSpec | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = [
    parseField(fields[0], 0, 59),
    parseField(fields[1], 0, 23),
    parseField(fields[2], 1, 31),
    parseField(fields[3], 1, 12),
    parseField(fields[4], 0, 6),
  ];
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

function matches(spec: CronSpec, d: Date): boolean {
  return (
    spec.minute.has(d.getMinutes()) &&
    spec.hour.has(d.getHours()) &&
    spec.dom.has(d.getDate()) &&
    spec.month.has(d.getMonth() + 1) &&
    spec.dow.has(d.getDay())
  );
}

/** 下一次触发时间（ms，分钟粒度）；一年内找不到返回 null（表达式非法/不可能） */
export function nextFire(cron: string, fromMs: number): number | null {
  const spec = parseCron(cron);
  if (!spec) return null;
  let t = Math.floor(fromMs / 60_000) * 60_000 + 60_000;
  const limit = t + 366 * 24 * 60 * 60_000;
  while (t <= limit) {
    if (matches(spec, new Date(t))) return t;
    t += 60_000;
  }
  return null;
}

/** 统一计算下次触发：一次性 = run_at 本身；间隔 = fromMs + interval；cron 走 nextFire。非法返回 null */
function nextRunFor(
  schedule: { cron: string; interval_minutes: number | null; run_at: number | null },
  fromMs: number
): number | null {
  if (schedule.run_at !== null && schedule.run_at !== undefined) return schedule.run_at;
  if (schedule.interval_minutes !== null && schedule.interval_minutes !== undefined) {
    return fromMs + schedule.interval_minutes * 60_000;
  }
  return nextFire(schedule.cron, fromMs);
}

// ---------- CRUD ----------

export function listTasks(petId: string): PetTask[] {
  const rows = getDb()
    .prepare("SELECT * FROM pet_tasks WHERE pet_id = ? ORDER BY created_at ASC")
    .all(petId) as unknown as TaskRow[];
  return rows.map(toTask);
}

export interface ScheduleInput {
  cron?: string;
  intervalMinutes?: number | null;
  /** 一次性任务的绝对触发时间（ms） */
  runAt?: number | null;
}

/** 调度参数三选一：cron / intervalMinutes / runAt；返回规范化结果或错误 */
export function normalizeSchedule(input: ScheduleInput):
  | { cron: string; intervalMinutes: number | null; runAt: number | null }
  | { error: string } {
  const cron = (input.cron ?? "").trim();
  const hasInterval = input.intervalMinutes !== undefined && input.intervalMinutes !== null;
  const hasRunAt = input.runAt !== undefined && input.runAt !== null;
  const kinds = [cron !== "", hasInterval, hasRunAt].filter(Boolean).length;
  if (kinds === 0) return { error: "请提供触发时间（cron / 间隔 / 一次性时间，三选一）" };
  if (kinds > 1) return { error: "cron、间隔、一次性时间只能选一种" };
  if (hasRunAt) {
    const t = input.runAt!;
    const now = Date.now();
    if (!Number.isFinite(t) || t <= now) return { error: "一次性时间必须是将来的时刻" };
    if (t > now + 366 * 24 * 60 * 60_000) return { error: "一次性时间最远一年内" };
    return { cron: "", intervalMinutes: null, runAt: Math.round(t) };
  }
  if (hasInterval) {
    const m = input.intervalMinutes!;
    if (!Number.isInteger(m) || m < INTERVAL_MIN || m > INTERVAL_MAX) {
      return { error: `间隔需为 ${INTERVAL_MIN}–${INTERVAL_MAX} 分钟的整数` };
    }
    return { cron: "", intervalMinutes: m, runAt: null };
  }
  if (nextFire(cron, Date.now()) === null) {
    return { error: "cron 表达式非法或一年内不会触发（五段：分 时 日 月 周）" };
  }
  return { cron, intervalMinutes: null, runAt: null };
}

/** 创建任务；调度非法（cron 无法触发 / 间隔越界 / 一次性时间在过去）返回 error */
export function createTask(
  petId: string,
  name: string,
  prompt: string,
  schedule: ScheduleInput
): { task: PetTask } | { error: string } {
  const trimmedName = name.trim().slice(0, 20);
  const trimmedPrompt = prompt.trim().slice(0, 500);
  if (!trimmedName || !trimmedPrompt) return { error: "名称和任务内容不能为空" };
  const sched = normalizeSchedule(schedule);
  if ("error" in sched) return sched;
  const next = nextRunFor({ cron: sched.cron, interval_minutes: sched.intervalMinutes, run_at: sched.runAt }, Date.now())!;
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO pet_tasks (id, pet_id, name, prompt, cron, interval_minutes, run_at, enabled, next_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(id, petId, trimmedName, trimmedPrompt, sched.cron, sched.intervalMinutes, sched.runAt, next, new Date().toISOString());
  return { task: listTasks(petId).find((t) => t.id === id)! };
}

export function updateTask(
  petId: string,
  taskId: string,
  patch: { name?: string; prompt?: string; cron?: string; intervalMinutes?: number | null; runAt?: number | null; enabled?: boolean }
): { task: PetTask } | { error: string } {
  const row = getDb().prepare("SELECT * FROM pet_tasks WHERE id = ? AND pet_id = ?").get(taskId, petId) as unknown as
    | TaskRow
    | undefined;
  if (!row) return { error: "任务不存在" };
  const sched = normalizeSchedule({
    cron: patch.cron ?? row.cron,
    intervalMinutes: patch.intervalMinutes !== undefined ? patch.intervalMinutes : row.interval_minutes,
    runAt: patch.runAt !== undefined ? patch.runAt : row.run_at,
  });
  if ("error" in sched) return sched;
  const next = nextRunFor({ cron: sched.cron, interval_minutes: sched.intervalMinutes, run_at: sched.runAt }, Date.now())!;
  const name = patch.name !== undefined ? patch.name.trim().slice(0, 20) : row.name;
  const prompt = patch.prompt !== undefined ? patch.prompt.trim().slice(0, 500) : row.prompt;
  if (!name || !prompt) return { error: "名称和任务内容不能为空" };
  const enabled = patch.enabled === undefined ? row.enabled : patch.enabled ? 1 : 0;
  getDb()
    .prepare("UPDATE pet_tasks SET name = ?, prompt = ?, cron = ?, interval_minutes = ?, run_at = ?, enabled = ?, next_run_at = ? WHERE id = ?")
    .run(name, prompt, sched.cron, sched.intervalMinutes, sched.runAt, enabled, next, taskId);
  return { task: listTasks(petId).find((t) => t.id === taskId)! };
}

export function deleteTask(petId: string, taskId: string): boolean {
  return getDb().prepare("DELETE FROM pet_tasks WHERE id = ? AND pet_id = ?").run(taskId, petId).changes > 0;
}

/** 取出宠物最近一次任务执行的汇报并标记已通知（悬浮球轮询时调用） */
export function takeTaskNotices(petId: string): PetTaskNotice[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM pet_tasks
       WHERE pet_id = ? AND last_run_at IS NOT NULL
         AND (notified_at IS NULL OR notified_at < last_run_at)
       ORDER BY last_run_at ASC`
    )
    .all(petId) as unknown as TaskRow[];
  if (rows.length === 0) return [];
  const now = Date.now();
  const stmt = getDb().prepare("UPDATE pet_tasks SET notified_at = ? WHERE id = ?");
  for (const r of rows) stmt.run(now, r.id);
  return rows.map((r) => ({
    taskName: r.name,
    status: (r.last_status as "ok" | "error") ?? "error",
    result: r.last_result ?? "",
    ranAt: r.last_run_at ?? now,
  }));
}

// ---------- 执行 ----------

/** 立即执行一个任务（调度器与"立即运行"共用）；宠物忙碌时返回 false 不执行 */
export async function runTaskNow(petId: string, taskId: string): Promise<boolean> {
  const row = getDb().prepare("SELECT * FROM pet_tasks WHERE id = ? AND pet_id = ?").get(taskId, petId) as unknown as
    | TaskRow
    | undefined;
  if (!row || isPetBusy(petId)) return false;

  const petName = getPetById(petId)?.pet.name ?? "宠物";
  const finish = (status: "ok" | "error", result: string) => {
    // 一次性任务执行后自动完成（停用、不再排程）；其余按各自规则算下次触发
    const once = row.run_at !== null && row.run_at !== undefined;
    getDb()
      .prepare("UPDATE pet_tasks SET last_run_at = ?, last_status = ?, last_result = ?, next_run_at = ?, enabled = ? WHERE id = ?")
      .run(Date.now(), status, result.slice(0, RESULT_MAX), once ? null : nextRunFor(row, Date.now()), once ? 0 : row.enabled, taskId);
    // 同步推微信（Server酱，未配置 SendKey 时静默跳过）
    notifyTaskResult(petName, row.name, status, result);
  };

  const release = acquirePetBusy(petId);
  try {
    const pet = getPetById(petId)?.pet;
    if (!pet?.ownerUserId) {
      finish("error", "宠物还未被领养");
      return true;
    }
    if (!pet.presetId) {
      finish("error", "还没有配置模型预设");
      return true;
    }
    const preset = await getPreset(pet.ownerUserId, pet.presetId);
    if (!preset) {
      finish("error", "绑定的模型预设已不存在");
      return true;
    }
    const workDir = petWorkspaceDir(petId);
    fs.mkdirSync(workDir, { recursive: true });
    const result = await runPiChatCollect({
      preset,
      sessionId: ensureChatSessionId(petId),
      message: buildPetMessage(pet, `【定时任务：${row.name}】${row.prompt}`),
      workDir,
    });
    finish("ok", result || "（任务完成，没有文字回复）");
  } catch (e) {
    finish("error", e instanceof Error ? e.message : String(e));
  } finally {
    release();
  }
  return true;
}

// ---------- 调度器（懒启动单例） ----------

function tick(): void {
  const now = Date.now();
  const due = getDb()
    .prepare("SELECT id, pet_id FROM pet_tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?")
    .all(now) as unknown as { id: string; pet_id: string }[];
  for (const t of due) {
    // 不阻塞 tick：每个任务异步执行；宠物忙碌（聊天中）则本轮跳过，下一拍重试
    runTaskNow(t.pet_id, t.id).catch((e) => console.error("[pet-scheduler] 任务执行异常:", e));
  }
}

/** 启动调度循环（幂等）；由宠物相关 API 路由首次命中时调用 */
export function ensureSchedulerStarted(): void {
  const g = globalThis as unknown as { __petSchedulerStarted?: boolean };
  if (g.__petSchedulerStarted) return;
  g.__petSchedulerStarted = true;
  const timer = setInterval(() => {
    try {
      tick();
    } catch (e) {
      console.error("[pet-scheduler] tick 异常:", e);
    }
  }, TICK_MS);
  timer.unref?.();
  console.log("[pet-scheduler] 已启动（30s 一拍）");
}

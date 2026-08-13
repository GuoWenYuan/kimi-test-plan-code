import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPreset } from "@/lib/models-store";
import { getPetById } from "@/lib/pet-store";
import { NL_TASK_RULE } from "@/lib/pet-task-rule";
import { createTask, ensureSchedulerStarted, normalizeSchedule } from "@/lib/pet-tasks";
import { runPiChatCollect } from "@/lib/pi-runner";

/**
 * 自然语言一句话 → 直接建好定时任务（仅主人）。
 * 时间规律（一次性 / 日历周期 / 纯间隔）不写死，由 PIAgent 按 NL_TASK_RULE 分析意图，
 * 模型输出 name+prompt+时间字段的 JSON，服务端 normalizeSchedule 校验后直接 createTask。
 */

async function requireOwner(params: Promise<{ id: string }>) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return { error: NextResponse.json({ error: "宠物不存在" }, { status: 404 }) };
  if (result.pet.ownerUserId !== user.id) {
    return { error: NextResponse.json({ error: "只有主人可以管理定时任务" }, { status: 403 }) };
  }
  return { pet: result.pet };
}

interface NlTaskOutput {
  name?: unknown;
  prompt?: unknown;
  onceInMinutes?: unknown;
  onceAt?: unknown;
  cron?: unknown;
  intervalMinutes?: unknown;
  error?: unknown;
}

/** 从模型输出里提取首个 JSON 对象并解析 */
function extractJson(output: string): NlTaskOutput | null {
  const m = /\{[^{}]*\}/.exec(output);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as unknown;
    if (parsed && typeof parsed === "object") return parsed as NlTaskOutput;
  } catch {
    // fall through
  }
  return null;
}

/** 「2026-08-08 07:00」（本地时区）→ ms；非法返回 null */
function parseLocalDateTime(s: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireOwner(params);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = (body?.text ?? "").trim().slice(0, 200);
  if (!text) return NextResponse.json({ error: "请描述任务和时间" }, { status: 400 });

  const pet = r.pet;
  if (!pet.ownerUserId || !pet.presetId) {
    return NextResponse.json({ error: "先在「状态」标签给宠物绑定模型预设，才能用一句话创建" }, { status: 400 });
  }
  const preset = await getPreset(pet.ownerUserId, pet.presetId);
  if (!preset) return NextResponse.json({ error: "绑定的模型预设已不存在" }, { status: 400 });

  const now = new Date();
  const nowText = `${now.toLocaleString("zh-CN", { hour12: false })} 周${"日一二三四五六"[now.getDay()]}`;
  let output: string;
  try {
    output = await runPiChatCollect({
      preset,
      sessionId: randomUUID(), // 单轮分析，不污染宠物对话会话
      message: `${NL_TASK_RULE}\n\n现在是 ${nowText}。\n需求：${text}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `模型调用失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const parsed = extractJson(output);
  if (!parsed || parsed.error) {
    return NextResponse.json({ error: "没理解这个时间，换个说法试试（如「1 分钟后提醒我喝水」「每天早上 9 点叫我」「每隔 30 分钟看看 workspace」）" }, { status: 400 });
  }

  // 三种时间字段 → 统一调度参数
  const nowMs = Date.now();
  const sched = normalizeSchedule({
    cron: typeof parsed.cron === "string" ? parsed.cron : undefined,
    intervalMinutes: typeof parsed.intervalMinutes === "number" ? Math.round(parsed.intervalMinutes) : null,
    runAt:
      typeof parsed.onceInMinutes === "number"
        ? nowMs + Math.max(1, Math.round(parsed.onceInMinutes)) * 60_000
        : typeof parsed.onceAt === "string"
          ? parseLocalDateTime(parsed.onceAt)
          : null,
  });
  if ("error" in sched) {
    return NextResponse.json({ error: `时间没算对（${sched.error}），换个说法试试` }, { status: 400 });
  }

  const name = (typeof parsed.name === "string" ? parsed.name : "").trim() || text.slice(0, 12);
  const prompt = (typeof parsed.prompt === "string" ? parsed.prompt : "").trim() || text;
  ensureSchedulerStarted();
  const result = createTask(r.pet.id, name, prompt, sched);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ task: result.task });
}

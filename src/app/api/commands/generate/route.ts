import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createCommand, type CommandTarget } from "@/lib/commands-store";
import { getPreset, listPresets } from "@/lib/models-store";
import { runPiChatCollect } from "@/lib/pi-runner";

/**
 * 自然语言需求 → PIAgent 生成 shell 指令并直接入库。
 * 模型按 GEN_RULE 输出 name+command+timeout 的 JSON，服务端校验后 createCommand。
 */

const GEN_RULE = `你是 shell 指令生成器。根据用户需求生成一条可直接执行的 shell 指令。
只输出一个 JSON 对象，不要输出任何其他文字、解释或 markdown 代码块：
{"name":"指令的简短中文名称","command":"shell 指令本体","timeout":60}
要求：
- command 优先单行，可用 && 或管道组合多条命令；不要臆造不存在的文件路径
- timeout 为 1-300 的整数秒：普通查询 30-60，耗时任务适当加大
- name 不超过 20 字
- 若需求无法转成 shell 指令，输出 {"error":"简短原因"}`;

const TARGET_ENV: Record<CommandTarget, string> = {
  local: "用户自己的电脑（操作系统未知，优先 POSIX 通用命令，避免 Windows 专用语法）",
  server: "服务器上的 Linux 容器（Debian 系，常见 GNU 工具可用）",
};

interface GenOutput {
  name?: unknown;
  command?: unknown;
  timeout?: unknown;
  error?: unknown;
}

/** 从模型输出里提取首个 JSON 对象并解析 */
function extractJson(output: string): GenOutput | null {
  const m = /\{[^{}]*\}/.exec(output);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as unknown;
    if (parsed && typeof parsed === "object") return parsed as GenOutput;
  } catch {
    // fall through
  }
  return null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { text?: string; target?: string; presetId?: string }
    | null;
  const text = (body?.text ?? "").trim().slice(0, 300);
  if (!text) return NextResponse.json({ error: "请描述你的需求" }, { status: 400 });
  const target: CommandTarget = body?.target === "server" ? "server" : "local";
  // 「服务器」目标仅超管可执行，非超管生成 server 指令没有意义
  if (target === "server" && user.role !== "super_admin") {
    return NextResponse.json({ error: "仅管理员可生成服务器目标指令" }, { status: 403 });
  }

  // 未指定预设时取用户首个预设
  const preset = body?.presetId
    ? await getPreset(user.id, String(body.presetId))
    : (await listPresets(user.id))[0];
  if (!preset) {
    return NextResponse.json({ error: "先在「模型」页添加模型预设，才能用 AI 生成" }, { status: 400 });
  }

  let output: string;
  try {
    output = await runPiChatCollect({
      preset,
      sessionId: randomUUID(), // 单轮生成，不复用会话
      message: `${GEN_RULE}\n\n执行环境：${TARGET_ENV[target]}。\n需求：${text}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `模型调用失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const parsed = extractJson(output);
  const name = (typeof parsed?.name === "string" ? parsed.name : "").trim();
  const command = (typeof parsed?.command === "string" ? parsed.command : "").trim();
  if (!parsed || parsed.error || !name || !command) {
    const reason = typeof parsed?.error === "string" ? parsed.error : "";
    return NextResponse.json(
      { error: reason || "没生成出指令，换个说法再试试（描述越具体越好）" },
      { status: 400 }
    );
  }

  const created = await createCommand(user.id, {
    name: name.slice(0, 40),
    command,
    target,
    timeout: typeof parsed.timeout === "number" ? parsed.timeout : 60,
  });
  return NextResponse.json({ command: created }, { status: 201 });
}

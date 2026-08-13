import { exec } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCommand } from "@/lib/commands-store";

const execAsync = promisify(exec);

const MAX_OUTPUT = 50 * 1024;

function truncate(s: string): string {
  return s.length > MAX_OUTPUT
    ? s.slice(0, MAX_OUTPUT) + `\n…（已截断至 ${MAX_OUTPUT} 字符）`
    : s;
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * 在服务器（workbench 容器）内执行快捷指令——仅 super_admin。
 * 这是刻意设计的管理员功能，不做命令白名单。
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const cmd = await getCommand(user.id, id);
  if (!cmd) {
    return NextResponse.json({ error: "指令不存在" }, { status: 404 });
  }
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "仅管理员可在服务器执行" }, { status: 403 });
  }
  if (cmd.target !== "server") {
    return NextResponse.json({ error: "该指令目标不是服务器" }, { status: 400 });
  }

  const timeoutMs = Math.min(Math.max(1, cmd.timeout), 300) * 1000;
  try {
    const { stdout, stderr } = await execAsync(cmd.command, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });
    const output = truncate([stdout, stderr].filter(Boolean).join("\n"));
    return NextResponse.json({ ok: true, exitCode: 0, output });
  } catch (e) {
    const err = e as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const combined = [err.stdout, err.stderr].filter(Boolean).join("\n");
    const timedOut = err.killed || err.signal === "SIGTERM";
    const output =
      truncate(combined) ||
      (timedOut ? `执行超时（>${cmd.timeout} 秒）` : (err.message ?? "执行失败"));
    return NextResponse.json({
      ok: false,
      exitCode: typeof err.code === "number" ? err.code : timedOut ? "timeout" : (err.code ?? 1),
      output,
    });
  }
}

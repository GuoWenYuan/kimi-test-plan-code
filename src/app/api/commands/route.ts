import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createCommand, listCommands } from "@/lib/commands-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  // 附带 role：前端据此决定是否显示「服务器」目标选项
  return NextResponse.json({ commands: await listCommands(user.id), role: user.role });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { name, command, target, timeout } = body ?? {};
  if (!name || !command) {
    return NextResponse.json({ error: "name / command 均为必填" }, { status: 400 });
  }
  const created = await createCommand(user.id, {
    name: String(name),
    command: String(command),
    target: target === "server" ? "server" : "local",
    timeout: Number(timeout) || 60,
  });
  return NextResponse.json(created, { status: 201 });
}

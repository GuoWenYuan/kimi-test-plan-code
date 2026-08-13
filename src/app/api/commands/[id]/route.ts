import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteCommand, updateCommand } from "@/lib/commands-store";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const { name, command, target, timeout } = body ?? {};
  const updated = await updateCommand(user.id, id, {
    ...(name !== undefined ? { name: String(name) } : {}),
    ...(command !== undefined ? { command: String(command) } : {}),
    ...(target !== undefined ? { target: target === "server" ? "server" : "local" } : {}),
    ...(timeout !== undefined ? { timeout: Number(timeout) || 60 } : {}),
  });
  if (!updated) {
    return NextResponse.json({ error: "指令不存在" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteCommand(user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "指令不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

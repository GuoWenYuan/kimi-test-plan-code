import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createSessionValue, registerUser, sessionCookieName } from "@/lib/auth";

/** 首个注册用户：把全局的旧数据（模型预设、知识库）迁移到其名下 */
async function migrateLegacyData(userId: string) {
  const dataDir = path.join(process.cwd(), "data");
  const userDir = path.join(dataDir, "users", userId);
  await fs.mkdir(userDir, { recursive: true });
  const moves: [string, string][] = [
    [path.join(dataDir, "models.json"), path.join(userDir, "models.json")],
    [path.join(dataDir, "knowledge"), path.join(userDir, "knowledge")],
  ];
  for (const [from, to] of moves) {
    try {
      await fs.rename(from, to);
    } catch {
      // 不存在或失败则跳过
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { username, password } = body ?? {};
  const { user, error, isFirst } = await registerUser(String(username ?? ""), String(password ?? ""));
  if (error || !user) {
    return NextResponse.json({ error: error ?? "注册失败" }, { status: 400 });
  }
  if (isFirst) {
    await migrateLegacyData(user.id);
  }
  const res = NextResponse.json({ ok: true, username: user.username });
  res.headers.set(
    "Set-Cookie",
    `${sessionCookieName()}=${encodeURIComponent(await createSessionValue(user.id))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  return res;
}

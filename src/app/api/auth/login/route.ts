import { NextResponse } from "next/server";
import { createSessionValue, sessionCookieName, verifyUser } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { username, password } = body ?? {};
  const user = await verifyUser(String(username ?? ""), String(password ?? ""));
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, username: user.username });
  res.headers.set(
    "Set-Cookie",
    `${sessionCookieName()}=${encodeURIComponent(await createSessionValue(user.id))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  return res;
}

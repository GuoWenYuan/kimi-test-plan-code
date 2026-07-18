import { cookies } from "next/headers";
import { createSession, findUserByUsername, seedSuperAdmin } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  seedSuperAdmin();

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return Response.json({ error: "请输入用户名和密码" }, { status: 400 });
  }

  // 密码为明文比较 —— 按客户要求的演示实现，生产环境应使用哈希
  const user = findUserByUsername(username);
  if (!user || user.password !== password) {
    return Response.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const session = createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return Response.json({ id: user.id, username: user.username, role: user.role });
}

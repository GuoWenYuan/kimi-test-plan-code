import { cookies } from "next/headers";
import { createSession, createUser, findUserByUsername, seedSuperAdmin } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/auth";

/** POST /api/auth/register —— 公开注册，角色固定为普通用户 user，成功后自动登录 */
export async function POST(request: Request) {
  seedSuperAdmin();

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const { username, password } = body;
  if (typeof username !== "string" || !username.trim()) {
    return Response.json({ error: "用户名不能为空" }, { status: 400 });
  }
  if (typeof password !== "string" || !password) {
    return Response.json({ error: "密码不能为空" }, { status: 400 });
  }
  if (findUserByUsername(username.trim())) {
    return Response.json({ error: "用户名已存在" }, { status: 409 });
  }

  // 注册角色固定为普通用户
  const user = createUser({ username: username.trim(), password, role: "user" });

  const session = createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return Response.json({ id: user.id, username: user.username, role: user.role }, { status: 201 });
}

import { getSessionUser } from "@/lib/auth";
import { createUser, findUserByUsername, listUsers, type Role } from "@/lib/store";

const ROLES: Role[] = ["super_admin", "user"];

/** GET /api/users —— 仅 super_admin；按需求返回明文密码（演示实现） */
export async function GET() {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (current.role !== "super_admin") {
    return Response.json({ error: "无权限访问用户管理" }, { status: 403 });
  }
  return Response.json(listUsers());
}

/** POST /api/users —— 仅 super_admin，创建用户 */
export async function POST(request: Request) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (current.role !== "super_admin") {
    return Response.json({ error: "无权限访问用户管理" }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const { username, password, role } = body;
  if (typeof username !== "string" || !username.trim()) {
    return Response.json({ error: "用户名不能为空" }, { status: 400 });
  }
  if (typeof password !== "string" || !password) {
    return Response.json({ error: "密码不能为空" }, { status: 400 });
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    return Response.json({ error: "角色不合法" }, { status: 400 });
  }
  if (findUserByUsername(username.trim())) {
    return Response.json({ error: "用户名已存在" }, { status: 409 });
  }

  const user = createUser({ username: username.trim(), password, role: role as Role });
  return Response.json(user, { status: 201 });
}

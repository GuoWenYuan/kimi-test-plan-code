import { getSessionUser } from "@/lib/auth";
import { deleteUser, updateUser, type Role } from "@/lib/store";

const ROLES: Role[] = ["super_admin", "user"];

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/users/[id] —— 仅 super_admin，修改密码/角色 */
export async function PATCH(request: Request, ctx: Ctx) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (current.role !== "super_admin") {
    return Response.json({ error: "无权限访问用户管理" }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: { password?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const patch: { password?: string; role?: Role } = {};
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || !body.password) {
      return Response.json({ error: "密码不能为空" }, { status: 400 });
    }
    patch.password = body.password;
  }
  if (body.role !== undefined) {
    if (typeof body.role !== "string" || !ROLES.includes(body.role as Role)) {
      return Response.json({ error: "角色不合法" }, { status: 400 });
    }
    patch.role = body.role as Role;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "没有需要修改的字段" }, { status: 400 });
  }

  const user = updateUser(id, patch);
  if (!user) {
    return Response.json({ error: "用户不存在" }, { status: 404 });
  }
  return Response.json(user);
}

/** DELETE /api/users/[id] —— 仅 super_admin，且不能删除自己 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (current.role !== "super_admin") {
    return Response.json({ error: "无权限访问用户管理" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (id === current.id) {
    return Response.json({ error: "不能删除当前登录用户" }, { status: 400 });
  }

  if (!deleteUser(id)) {
    return Response.json({ error: "用户不存在" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

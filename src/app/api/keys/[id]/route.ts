import { getSessionUser } from "@/lib/auth";
import { deleteKey, listKeys, updateKey } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/keys/[id] —— 仅 Key 所有者可编辑 */
export async function PUT(request: Request, ctx: Ctx) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = listKeys().find((k) => k.id === id);
  if (!existing) {
    return Response.json({ error: "Key 不存在" }, { status: 404 });
  }
  if (existing.userId !== current.id) {
    return Response.json({ error: "只能修改自己的 Key" }, { status: 403 });
  }

  let body: { name?: unknown; baseUrl?: unknown; apiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const patch: { name?: string; baseUrl?: string; apiKey?: string } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return Response.json({ error: "名称不能为空" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string" || !body.baseUrl.trim()) {
      return Response.json({ error: "baseUrl 不能为空" }, { status: 400 });
    }
    patch.baseUrl = body.baseUrl.trim();
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return Response.json({ error: "apiKey 不能为空" }, { status: 400 });
    }
    patch.apiKey = body.apiKey.trim();
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "没有需要修改的字段" }, { status: 400 });
  }

  return Response.json(updateKey(id, patch));
}

/** DELETE /api/keys/[id] —— 仅 Key 所有者可删除 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = listKeys().find((k) => k.id === id);
  if (!existing) {
    return Response.json({ error: "Key 不存在" }, { status: 404 });
  }
  if (existing.userId !== current.id) {
    return Response.json({ error: "只能删除自己的 Key" }, { status: 403 });
  }

  deleteKey(id);
  return Response.json({ ok: true });
}

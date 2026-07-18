import { getSessionUser } from "@/lib/auth";
import { createKey, findUserById, listKeys, listKeysByUser } from "@/lib/store";

/**
 * GET /api/keys —— Key 列表接口：
 * - 默认返回当前用户自己的 Key（含完整 apiKey，本人可见）；
 * - super_admin 带 ?all=true 时返回所有用户的 Key 列表，
 *   服务端直接剔除 apiKey 字段，绝不返回他人的 apiKey。
 */
export async function GET(request: Request) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("all") === "true") {
    if (current.role !== "super_admin") {
      return Response.json({ error: "无权限查看所有用户的 Key" }, { status: 403 });
    }
    const result = listKeys().map((k) => ({
      id: k.id,
      name: k.name,
      baseUrl: k.baseUrl,
      owner: findUserById(k.userId)?.username ?? "未知用户",
      createdAt: k.createdAt,
      // 注意：刻意不包含 apiKey 字段
    }));
    return Response.json(result);
  }

  return Response.json(listKeysByUser(current.id));
}

/** POST /api/keys —— 创建当前用户自己的 Key */
export async function POST(request: Request) {
  const current = await getSessionUser();
  if (!current) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  let body: { name?: unknown; baseUrl?: unknown; apiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const { name, baseUrl, apiKey } = body;
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "名称不能为空" }, { status: 400 });
  }
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return Response.json({ error: "baseUrl 不能为空" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return Response.json({ error: "apiKey 不能为空" }, { status: 400 });
  }

  const key = createKey({
    userId: current.id,
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
  });
  return Response.json(key, { status: 201 });
}

import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  return Response.json({ id: user.id, username: user.username, role: user.role });
}

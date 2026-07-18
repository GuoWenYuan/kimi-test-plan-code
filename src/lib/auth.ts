import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession, findUserById, seedSuperAdmin, type User } from "@/lib/store";

export const SESSION_COOKIE = "session";

/** 读取当前 session 对应的用户；未登录或 session 失效时返回 null */
export async function getSessionUser(): Promise<User | null> {
  seedSuperAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = findSession(token);
  if (!session) return null;
  return findUserById(session.userId) ?? null;
}

/** 页面用：未登录跳转到 /login */
export async function requireUserOrRedirect(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

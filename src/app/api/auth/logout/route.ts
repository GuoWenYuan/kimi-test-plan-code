import { cookies } from "next/headers";
import { deleteSession } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    deleteSession(token);
  }
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}

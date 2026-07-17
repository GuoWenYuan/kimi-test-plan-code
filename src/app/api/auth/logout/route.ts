import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", `${sessionCookieName()}=; Path=/; HttpOnly; Max-Age=0`);
  return res;
}

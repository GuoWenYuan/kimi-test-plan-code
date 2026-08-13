import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteDevice } from "@/lib/devices-store";

/** 删除本人一台远程设备（Next 16：params 是 Promise） */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!deleteDevice(user.id, id)) return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

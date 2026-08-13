import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listDevices } from "@/lib/devices-store";

/** 列出当前用户的远程设备（/tools 页「远程设备」区块数据源） */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(listDevices(user.id));
}

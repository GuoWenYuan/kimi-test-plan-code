import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { upsertHeartbeat, type DeviceEndpoint } from "@/lib/devices-store";

const MAX_ENDPOINTS = 20;

function sanitizeEndpoints(input: unknown): DeviceEndpoint[] | null {
  if (!Array.isArray(input) || input.length > MAX_ENDPOINTS) return null;
  const out: DeviceEndpoint[] = [];
  for (const e of input as Record<string, unknown>[]) {
    if (typeof e?.label !== "string" || !e.label) return null;
    if (typeof e?.remoteUrl !== "string" || !/^https?:\/\//.test(e.remoteUrl)) return null;
    const localPort = Number(e.localPort);
    if (!Number.isInteger(localPort) || localPort < 0 || localPort > 65535) return null;
    out.push({
      ...(typeof e.toolId === "string" && e.toolId ? { toolId: e.toolId } : {}),
      label: e.label.slice(0, 50),
      localPort,
      remoteUrl: e.remoteUrl.slice(0, 200),
      ...(typeof e.token === "string" && e.token ? { token: e.token } : {}),
      online: Boolean(e.online),
    });
  }
  return out;
}

/** 设备心跳：统一桥（tools/workbench-bridge.mjs）定时上报（Bearer 个人 API 令牌，与知识库 MCP 同一令牌） */
export async function POST(req: Request) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "未认证" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 50) : "";
  const endpoints = sanitizeEndpoints(body?.endpoints);
  if (!name || !endpoints) {
    return NextResponse.json(
      { error: "name 必填；endpoints 须为数组，元素含 label / localPort / remoteUrl(http(s)://) / online" },
      { status: 400 }
    );
  }
  const device = upsertHeartbeat(user.id, name, endpoints);
  return NextResponse.json({ ok: true, id: device.id });
}

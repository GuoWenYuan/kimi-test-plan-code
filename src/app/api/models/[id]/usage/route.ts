import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPreset } from "@/lib/models-store";
import { fetchPresetUsage, type UsageResult } from "@/lib/usage-api";
import { getModelTokenStats } from "@/lib/token-usage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 用量面板数据：官方 API 直查余额/额度 + 本服务器 PIAgent 会话的 token 统计。
 * 两路互不阻塞：直查失败（含平台不支持）只带 usageError，token 统计照常返回。
 */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const preset = await getPreset(user.id, id);
  if (!preset) {
    return NextResponse.json({ error: "预设不存在" }, { status: 404 });
  }
  let usage: UsageResult | null = null;
  let usageError: string | null = null;
  try {
    usage = await fetchPresetUsage(preset);
    if (!usage) usageError = "该平台暂不支持 API 直查用量";
  } catch (err) {
    usageError = err instanceof Error ? err.message : String(err);
  }
  const tokens = getModelTokenStats(preset.model);
  return NextResponse.json({ ok: true, usage, usageError, tokens });
}

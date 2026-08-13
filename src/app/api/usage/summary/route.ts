import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { listPresets } from "@/lib/models-store";
import { fetchPresetUsage, type UsageResult } from "@/lib/usage-api";
import { getModelTokenStats, type ModelTokenStats } from "@/lib/token-usage";

export interface UsageSummaryItem {
  id: string;
  name: string;
  model: string;
  usage: UsageResult | null;
  usageError: string | null;
  tokens: ModelTokenStats | null;
}

/**
 * GET /api/usage/summary —— 当前用户全部预设的用量汇总（余额/额度 + token 统计）。
 * 双认证（session cookie 或 Bearer 个人 API 令牌），供「用量面板」Chrome 扩展在本机工具页展示。
 */
export async function GET(req: Request) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const presets = await listPresets(user.id);
  const items: UsageSummaryItem[] = await Promise.all(
    presets.map(async (p) => {
      let usage: UsageResult | null = null;
      let usageError: string | null = null;
      try {
        usage = await fetchPresetUsage(p);
        if (!usage) usageError = "该平台暂不支持 API 直查";
      } catch (err) {
        usageError = err instanceof Error ? err.message : String(err);
      }
      return {
        id: p.id,
        name: p.name,
        model: p.model,
        usage,
        usageError,
        tokens: getModelTokenStats(p.model),
      };
    })
  );
  return NextResponse.json({ ok: true, items, serverTime: new Date().toISOString() });
}

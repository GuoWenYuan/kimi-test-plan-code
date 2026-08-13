/**
 * 服务端用量直查：用预设自己的 ApiKey 调官方 REST 接口取余额/额度，
 * 结果规范化后给 /models 页用量面板原生展示（官方控制台 iframe 之上的摘要）。
 *
 * 端点与字段映射参考 kimi-code-monitor 扩展（providers.js / background.js）：
 * - DeepSeek      GET api.deepseek.com/user/balance          → balance_infos（按币种拆分）
 * - Kimi 开放平台 GET <baseUrl origin>/v1/users/me/balance    → available/voucher/cash
 * - Kimi Code     GET api.kimi.com/coding/v1/usages           → 5h/本周额度窗口
 *   （该接口官方走设备 OAuth，ApiKey 可能 401，此时由页面回退到内嵌控制台）
 *
 * 仅服务端使用：ApiKey 不出服务器。
 */

export interface UsageBalance {
  kind: "balance";
  provider: string;
  total: number;
  /** 赠送/代金券部分 */
  granted: number;
  /** 充值/现金部分 */
  paid: number;
  currency: string;
}

export interface UsagePlanWindow {
  label: string;
  /** 已用百分比 0-100 */
  percent: number;
  resetAt: string | null;
}

export interface UsagePlan {
  kind: "plan";
  provider: string;
  windows: UsagePlanWindow[];
}

export type UsageResult = UsageBalance | UsagePlan;

async function getJson(url: string, apiKey: string): Promise<unknown> {
  // 粘贴的 key 可能混入全角/不可见字符，header 只接受可见 ASCII
  const safeKey = String(apiKey || "").replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${safeKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Key 无效或该接口不接受 ApiKey（401）");
    if (res.status === 403) throw new Error("没有访问权限（403）");
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function toMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", USD: "$" };

// DeepSeek：balance_infos 按币种拆分，优先人民币，取不到用第一条
function parseDeepSeek(body: unknown): UsageBalance {
  const infos = Array.isArray((body as { balance_infos?: unknown[] })?.balance_infos)
    ? ((body as { balance_infos: Record<string, unknown>[] }).balance_infos ?? [])
    : [];
  const info =
    infos.find((i) => i?.currency === "CNY") ?? infos[0];
  if (!info) throw new Error("响应中没有余额信息");
  const cur = String(info.currency ?? "CNY");
  return {
    kind: "balance",
    provider: "DeepSeek",
    total: toMoney(info.total_balance),
    granted: toMoney(info.granted_balance),
    paid: toMoney(info.topped_up_balance),
    currency: CURRENCY_SYMBOL[cur] ?? cur,
  };
}

// Kimi 开放平台（Moonshot）：available / voucher / cash
function parseKimiApi(body: unknown): UsageBalance {
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data || data.available_balance == null) throw new Error("响应中没有余额字段");
  return {
    kind: "balance",
    provider: "Kimi 开放平台",
    total: toMoney(data.available_balance),
    granted: toMoney(data.voucher_balance),
    paid: toMoney(data.cash_balance),
    currency: "¥",
  };
}

// 额度使用率：used 缺省时用 limit - remaining（与扩展 metrics.js quotaPercentage 同口径）
function quotaPercentage(detail: Record<string, unknown> | undefined): number | null {
  const limit = Number(detail?.limit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const explicitUsed = Number(detail?.used);
  const used =
    Number.isFinite(explicitUsed) && explicitUsed >= 0
      ? explicitUsed
      : Math.max(0, limit - (Number(detail?.remaining) || 0));
  return (used / limit) * 100;
}

function resetTimeOf(detail: Record<string, unknown> | undefined): string | null {
  const v = detail?.resetsAt ?? detail?.resetAt ?? detail?.nextResetTime ?? null;
  return typeof v === "string" && v ? v : null;
}

// Kimi Code 订阅额度：limits[] 里 duration=300（分钟）的是 5 小时窗口，data.usage 是本周
function parseKimiCodeQuota(body: unknown): UsagePlan {
  const data = body as {
    limits?: { window?: { duration?: unknown }; detail?: Record<string, unknown> }[];
    usage?: Record<string, unknown>;
  };
  const windows: UsagePlanWindow[] = [];
  const fiveHour = (data?.limits ?? []).find((e) => Number(e?.window?.duration) === 300);
  const fivePct = quotaPercentage(fiveHour?.detail);
  if (fivePct != null) {
    windows.push({ label: "5 小时额度", percent: fivePct, resetAt: resetTimeOf(fiveHour?.detail) });
  }
  const weekPct = quotaPercentage(data?.usage);
  if (weekPct != null) {
    windows.push({ label: "本周额度", percent: weekPct, resetAt: resetTimeOf(data?.usage) });
  }
  if (!windows.length) throw new Error("响应中没有额度窗口");
  return { kind: "plan", provider: "Kimi Code", windows };
}

/** 用预设自身 ApiKey 直查官方用量；不支持的平台返回 null，失败抛错 */
export async function fetchPresetUsage(input: {
  baseUrl: string;
  apiKey: string;
}): Promise<UsageResult | null> {
  const { baseUrl, apiKey } = input;
  if (/right\.codes/i.test(baseUrl)) return null;
  if (/deepseek/i.test(baseUrl)) {
    return parseDeepSeek(await getJson("https://api.deepseek.com/user/balance", apiKey));
  }
  if (apiKey.startsWith("sk-kimi-") || /api\.kimi\.com\/coding/i.test(baseUrl)) {
    return parseKimiCodeQuota(await getJson("https://api.kimi.com/coding/v1/usages", apiKey));
  }
  if (/moonshot|api\.kimi\.com|platform\.kimi/i.test(baseUrl)) {
    let origin: string;
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      throw new Error("BaseUrl 无法解析");
    }
    return parseKimiApi(await getJson(`${origin}/v1/users/me/balance`, apiKey));
  }
  return null;
}

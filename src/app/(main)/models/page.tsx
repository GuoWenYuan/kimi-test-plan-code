"use client";

import { useCallback, useEffect, useState } from "react";
import { officialUsagePage } from "@/lib/usage-pages";
import type { UsageResult } from "@/lib/usage-api";
import type { ModelTokenStats, TokenBucket } from "@/lib/token-usage";

/** /api/models/[id]/usage 的面板数据：官方直查 + 本服务器 PIAgent 会话 token 统计 */
interface UsagePanelData {
  usage: UsageResult | null;
  usageError: string | null;
  tokens: ModelTokenStats | null;
}

interface ModelPreset {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

const EMPTY_FORM = { name: "", model: "", baseUrl: "", apiKey: "" };

function maskKey(key: string) {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function formatMoney(n: number) {
  return n.toFixed(2);
}

/** API 直查用量摘要：余额卡片或额度进度条 */
function UsageSummary({ data }: { data: UsagePanelData | undefined }) {
  if (!data) return <p className="text-xs text-muted">用量查询中…</p>;
  if (!data.usage) {
    return <p className="text-xs text-muted">API 直查不可用：{data.usageError ?? "查询失败"}</p>;
  }
  const entry = data.usage;
  if (entry.kind === "balance") {
    return (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <div>
          <p className="text-xs text-muted">可用余额</p>
          <p className="text-lg font-semibold text-fg">
            {entry.currency}
            {formatMoney(entry.total)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">充值</p>
          <p className="text-sm text-fg">
            {entry.currency}
            {formatMoney(entry.paid)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">赠送/代金券</p>
          <p className="text-sm text-fg">
            {entry.currency}
            {formatMoney(entry.granted)}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entry.windows.map((w) => {
        const pct = Math.max(0, Math.min(100, w.percent));
        return (
          <div key={w.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted">{w.label}</span>
              <span className="text-fg">
                已用 {pct.toFixed(1)}%
                {w.resetAt && (
                  <span className="ml-2 text-muted">重置 {new Date(w.resetAt).toLocaleString()}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
              <div
                className={`h-full rounded-full ${pct >= 95 ? "bg-danger" : pct >= 80 ? "bg-amber-500" : "bg-accent"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.floor(n));
}

/** 缓存命中率 = 缓存读取 ÷ 总输入（总输入 = 未缓存 + 缓存读取 + 缓存创建） */
function cacheHitRate(b: TokenBucket): string | null {
  const total = b.input + b.cacheRead + b.cacheWrite;
  return total > 0 ? `${((b.cacheRead / total) * 100).toFixed(1)}%` : null;
}

/** Token 用量三窗口（24h / 7 天 / 30 天），数据来自本服务器 PIAgent 会话记录 */
function TokenStats({ stats }: { stats: ModelTokenStats }) {
  const windows = [
    { label: "24 小时", bucket: stats.h24 },
    { label: "7 天", bucket: stats.d7 },
    { label: "30 天", bucket: stats.d30 },
  ];
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">Token 用量（本服务器 PIAgent 会话统计）</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {windows.map((w) => {
          const hit = cacheHitRate(w.bucket);
          return (
            <div key={w.label} className="rounded-lg bg-subtle px-3 py-2">
              <p className="text-xs text-muted">{w.label}</p>
              <p className="mt-0.5 text-sm text-fg">
                输入 {formatTokens(w.bucket.input)} · 输出 {formatTokens(w.bucket.output)}
              </p>
              <p className="text-xs text-muted">缓存命中 {hit ?? "—"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  // 右侧用量面板当前展示的预设 id
  const [usageId, setUsageId] = useState<string | null>(null);
  // API 直查 + token 统计结果：usageData 中无记录即视为加载中
  const [usageData, setUsageData] = useState<Record<string, UsagePanelData>>({});

  const refresh = useCallback(async () => {
    const res = await fetch("/api/models");
    if (res.status === 401) {
      setNeedLogin(true);
      setLoading(false);
      return;
    }
    setPresets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 选中预设后自动拉取用量面板数据；usageData 中无记录即视为加载中
  useEffect(() => {
    if (!usageId || usageData[usageId]) return;
    fetch(`/api/models/${usageId}/usage`)
      .then(async (res) => {
        const data = await res.json();
        setUsageData((m) => ({
          ...m,
          [usageId]:
            res.ok && data.ok
              ? { usage: data.usage ?? null, usageError: data.usageError ?? null, tokens: data.tokens ?? null }
              : { usage: null, usageError: data.error ?? "查询失败", tokens: null },
        }));
      })
      .catch((e) =>
        setUsageData((m) => ({
          ...m,
          [usageId]: { usage: null, usageError: e instanceof Error ? e.message : String(e), tokens: null },
        }))
      );
  }, [usageId, usageData]);

  // 清掉缓存记录，由上面的 effect 重新拉取
  const reloadUsage = (id: string) =>
    setUsageData((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });

  const submit = async () => {
    setError("");
    const url = editingId ? `/api/models/${editingId}` : "/api/models";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "保存失败");
      return;
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    refresh();
  };

  const startEdit = (p: ModelPreset) => {
    setForm({ name: p.name, model: p.model, baseUrl: p.baseUrl, apiKey: p.apiKey });
    setEditingId(p.id);
    setShowForm(true);
    setError("");
  };

  const remove = async (id: string) => {
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    refresh();
  };

  const test = async (id: string) => {
    setTestingId(id);
    setTestResult((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/models/${id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult((m) => ({
        ...m,
        [id]: data.ok ? `✅ ${data.reply}` : `❌ ${data.error}`,
      }));
    } catch (e) {
      setTestResult((m) => ({ ...m, [id]: `❌ ${e instanceof Error ? e.message : e}` }));
    } finally {
      setTestingId(null);
    }
  };

  if (needLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">模型预设为个人数据，请先登录</p>
        <a
          href="/login"
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
        >
          去登录
        </a>
      </div>
    );
  }

  const usagePreset = presets.find((p) => p.id === usageId) ?? null;
  const usagePage = usagePreset ? officialUsagePage(usagePreset) : null;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-fg">模型预设</h1>
          <p className="mt-1 text-sm text-muted">
            预设大模型的 ApiKey 与 BaseUrl 并命名包装，宠物对话等场景可直接选用；点「用量」在右侧内嵌官方控制台查看详细用量（需安装内嵌助手 Chrome 扩展）。
          </p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditingId(null);
            setShowForm((v) => !v);
            setError("");
          }}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
        >
          {showForm ? "取消" : "+ 新增预设"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* 左列：表单 + 预设列表 */}
        <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto lg:w-96">
          {showForm && (
            <div className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
              {(
                [
                  { key: "name", label: "包装名称", placeholder: "如：Kimi 生产环境" },
                  { key: "model", label: "模型名", placeholder: "如：kimi-k2 / gpt-4o" },
                  { key: "baseUrl", label: "BaseUrl", placeholder: "如：https://api.moonshot.cn/v1" },
                  { key: "apiKey", label: "ApiKey", placeholder: "sk-..." },
                ] as const
              ).map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">{f.label}</span>
                  <input
                    value={form[f.key]}
                    placeholder={f.placeholder}
                    type={f.key === "apiKey" ? "password" : "text"}
                    onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </label>
              ))}
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                onClick={submit}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {editingId ? "保存修改" : "创建预设"}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted">加载中…</p>
          ) : presets.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-card py-14 shadow-card">
              <div className="text-3xl">🤖</div>
              <p className="mt-3 text-sm font-medium text-fg">还没有模型预设</p>
              <p className="mt-1 text-sm text-muted">点击右上角「新增预设」添加第一个模型。</p>
            </div>
          ) : (
            presets.map((p) => {
              const up = officialUsagePage(p);
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border bg-card p-4 shadow-card transition-colors ${
                    usageId === p.id ? "border-accent ring-2 ring-accent/25" : "border-line"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg">{p.name}</span>
                    <span className="rounded bg-subtle px-1.5 py-0.5 text-xs text-muted">
                      {p.model}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted">
                    {p.baseUrl} · Key: {maskKey(p.apiKey)}
                  </p>
                  {testResult[p.id] && (
                    <p className="mt-2 text-xs text-muted">{testResult[p.id]}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {up && (
                      <button
                        onClick={() => setUsageId((cur) => (cur === p.id ? null : p.id))}
                        className={`rounded-lg border px-2.5 py-1 transition-colors ${
                          usageId === p.id
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line text-muted hover:bg-subtle hover:text-fg"
                        }`}
                      >
                        用量
                      </button>
                    )}
                    <button
                      onClick={() => test(p.id)}
                      disabled={testingId === p.id}
                      className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50"
                    >
                      {testingId === p.id ? "测试中…" : "测试连接"}
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="rounded-lg border border-danger/40 px-2.5 py-1 text-danger transition-colors hover:bg-danger/10"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 右侧：官方用量面板 */}
        <div className="flex min-h-[50vh] min-w-0 flex-1 flex-col rounded-2xl border border-line bg-card shadow-card lg:min-h-0">
          {usagePreset && usagePage ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <span className="truncate text-sm text-fg">
                  <span className="font-medium">{usagePreset.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {usagePage.provider} · 登录态使用你浏览器中的官方账号
                  </span>
                </span>
                <div className="flex shrink-0 gap-3 text-xs">
                  <a
                    href={usagePage.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    新标签打开
                  </a>
                  <button
                    onClick={() => setUsageId(null)}
                    className="text-muted transition-colors hover:text-fg"
                  >
                    关闭
                  </button>
                </div>
              </div>
              {/* 用量摘要：官方 API 直查 + PIAgent 会话 token 统计，失败仅提示，不影响下方内嵌控制台 */}
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
                <div className="min-w-0 flex-1 space-y-3">
                  <UsageSummary data={usageData[usagePreset.id]} />
                  {usageData[usagePreset.id]?.tokens && (
                    <TokenStats stats={usageData[usagePreset.id].tokens!} />
                  )}
                </div>
                <button
                  onClick={() => reloadUsage(usagePreset.id)}
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
                >
                  刷新
                </button>
              </div>
              <iframe
                src={usagePage.url}
                title={usagePage.provider}
                className="min-h-0 w-full flex-1"
              />
              <p className="border-t border-line px-4 py-1.5 text-xs text-muted">
                若显示空白或“已拒绝连接”：官方页面禁止跨源嵌入，安装
                <a href="/api/frame-embed" className="mx-1 text-accent hover:underline">
                  内嵌助手扩展
                </a>
                （解压后在 chrome://extensions 开发者模式中加载）并刷新，或使用新标签打开。
              </p>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center md:p-8">
              <p className="text-sm text-muted">点击左侧预设卡片的「用量」，在此内嵌官方控制台查看详细用量</p>
              <p className="text-xs text-muted">
                内嵌需安装
                <a href="/api/frame-embed" className="mx-1 text-accent hover:underline">
                  内嵌助手 Chrome 扩展
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

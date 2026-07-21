"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_TOOLS, type AiTool } from "@/lib/ai-tools";

type Status = "checking" | "online" | "offline";

/** 工具的浏览器访问地址：local 模式指向用户自己电脑的 127.0.0.1，否则用当前网页主机名 */
function toolUrl(t: AiTool, port: number, token: string): string {
  const host = t.local ? "127.0.0.1" : location.hostname;
  const p = t.local ? port : (t.publicPort ?? port);
  const hash = t.tokenHash && token ? `#token=${encodeURIComponent(token)}` : "";
  return `${location.protocol}//${host}:${p}${t.path ?? "/"}${hash}`;
}

const tokenKey = (id: string) => `ai-tool-token-${id}`;
const portKey = (id: string) => `ai-tool-port-${id}`;

export default function ToolsPanel() {
  const [status, setStatus] = useState<Record<string, Status>>({});
  // 令牌与端口覆盖均存浏览器 localStorage，惰性初始化读取
  const [tokens, setTokens] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    const saved: Record<string, string> = {};
    for (const t of AI_TOOLS) {
      if (t.tokenHash) saved[t.id] = localStorage.getItem(tokenKey(t.id)) ?? "";
    }
    return saved;
  });
  const [ports, setPorts] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    const saved: Record<string, string> = {};
    for (const t of AI_TOOLS) {
      saved[t.id] = localStorage.getItem(portKey(t.id)) ?? String(t.port);
    }
    return saved;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  // 打开工具后自动把卡片区收起为标签条，让工作区占满页面
  const [collapsed, setCollapsed] = useState(false);

  const effPort = useCallback(
    (t: AiTool) => {
      const n = Number(ports[t.id]);
      return Number.isInteger(n) && n > 0 && n <= 65535 ? n : t.port;
    },
    [ports],
  );

  /**
   * 从浏览器探测工具是否可达（no-cors：可达即 resolve，拒绝连接则 reject）。
   * 注意：浏览器私网访问保护（PNA）可能拦截跨源到 127.0.0.1 的 fetch 造成误报 offline，
   * 因此探测结果仅供参考、不禁用打开按钮；已确认在线（iframe 加载成功）的工具不再自动重探。
   */
  const check = useCallback(
    async (t: AiTool, force = false) => {
      let skip = false;
      setStatus((s) => {
        if (!force && s[t.id] === "online") {
          skip = true;
          return s;
        }
        return { ...s, [t.id]: "checking" };
      });
      if (skip) return;
      try {
        const host = t.local ? "127.0.0.1" : location.hostname;
        await fetch(`${location.protocol}//${host}:${effPort(t)}/`, {
          mode: "no-cors",
          signal: AbortSignal.timeout(3000),
        });
        setStatus((s) => ({ ...s, [t.id]: "online" }));
      } catch {
        setStatus((s) => ({ ...s, [t.id]: "offline" }));
      }
    },
    [effPort],
  );

  const checkAll = useCallback(
    (force = false) => {
      AI_TOOLS.forEach((t) => check(t, force));
    },
    [check],
  );

  useEffect(() => {
    // 首次挂载探测各工具状态，之后每 10 秒自动重探（跳过已确认在线的）
    checkAll();
    const timer = setInterval(() => checkAll(), 10000);
    return () => clearInterval(timer);
  }, [checkAll]);

  function saveToken(id: string, value: string) {
    setTokens((m) => ({ ...m, [id]: value }));
    localStorage.setItem(tokenKey(id), value);
  }

  function savePort(t: AiTool, value: string) {
    setPorts((m) => ({ ...m, [t.id]: value }));
    localStorage.setItem(portKey(t.id), value);
    // 端口变化后立即按新端口重探
    const n = Number(value);
    if (Number.isInteger(n) && n > 0 && n <= 65535) {
      setStatus((s) => ({ ...s, [t.id]: "checking" }));
      check(t, true);
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 2000);
    } catch {
      window.prompt("请手动复制：", text);
    }
  }

  // 最大化时按 Esc 还原
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const active = AI_TOOLS.find((t) => t.id === activeId) ?? null;

  function openTool(id: string) {
    setActiveId(id);
    setCollapsed(true);
  }

  const dotCls = (st: Status | undefined) =>
    st === "online" ? "bg-green-500" : st === "checking" ? "bg-yellow-400" : "bg-gray-300 dark:bg-gray-600";

  /** 嵌入区：collapsed 时无边框无工具栏，iframe 铺满剩余可显示区域；最大化时全屏 */
  function renderEmbed(fullscreen: boolean) {
    if (!active) return null;
    const iframe = (
      <iframe
        key={`${active.id}-${effPort(active)}-${tokens[active.id] ?? ""}`}
        src={toolUrl(active, effPort(active), tokens[active.id] ?? "")}
        title={active.name}
        onLoad={() => setStatus((s) => ({ ...s, [active.id]: "online" }))}
        className="min-h-0 w-full flex-1"
      />
    );
    if (fullscreen) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-card">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="text-xs text-muted">
              {active.name} · 127.0.0.1:{effPort(active)}
            </span>
            <button
              onClick={() => setMaximized(false)}
              className="rounded-lg border border-line px-2 py-0.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
            >
              还原（Esc）
            </button>
          </div>
          {iframe}
        </div>
      );
    }
    if (collapsed) {
      return <div className="flex min-h-0 flex-1 flex-col">{iframe}</div>;
    }
    return (
      <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span className="text-xs text-muted">
            {active.name} · 127.0.0.1:{effPort(active)}
          </span>
          <button
            onClick={() => setMaximized(true)}
            className="rounded-lg border border-line px-2 py-0.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
          >
            最大化
          </button>
        </div>
        {iframe}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {collapsed ? (
        // 收起态：一行标签条，工作区占满剩余页面
        <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-3 py-1.5">
          <span className="shrink-0 text-sm font-semibold text-fg">AI 工具</span>
          {AI_TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => openTool(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                activeId === t.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:bg-subtle hover:text-fg"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotCls(status[t.id])}`} />
              {t.name}
            </button>
          ))}
          <div className="ml-auto flex shrink-0 gap-2 text-xs">
            {active && (
              <button
                onClick={() => setMaximized(true)}
                className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                最大化
              </button>
            )}
            <button
              onClick={() => checkAll(true)}
              className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
            >
              刷新
            </button>
            <button
              onClick={() => setCollapsed(false)}
              className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
            >
              管理工具
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">AI 工具</h1>
          <p className="mt-1 text-sm text-muted">
            工具运行在你自己的电脑上，浏览器直连本机地址，不经过部署服务器；新工具（如 codex）可在 src/lib/ai-tools.ts 注册。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {active && (
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-lg border border-line px-4 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg"
            >
              收起面板
            </button>
          )}
          <button
            onClick={() => checkAll(true)}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            刷新状态
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AI_TOOLS.map((t) => {
          const st = status[t.id] ?? "checking";
          return (
            <div key={t.id} className="space-y-2 rounded-xl border border-line bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-fg">{t.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    st === "online"
                      ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                      : st === "offline"
                        ? "bg-subtle text-muted"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
                  }`}
                >
                  {st === "online" ? "本机在线" : st === "offline" ? "未检测到" : "检测中…"}
                </span>
              </div>
              <p className="text-xs text-muted">{t.description}</p>

              {st === "offline" && (
                <div className="space-y-1 rounded-md bg-subtle p-2">
                  {t.startCommand && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate text-xs text-fg">{t.startCommand}</code>
                      <button
                        onClick={() => copyText(`${t.id}-start`, t.startCommand!)}
                        className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-xs text-muted transition-colors hover:bg-hover hover:text-fg"
                      >
                        {copiedKey === `${t.id}-start` ? "已复制" : "复制"}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    连接被拒绝说明该端口没有服务在监听：请核对本机工具实际端口并修改下方端口；
                    若工具已运行且端口正确仍显示未检测到，是浏览器私网访问保护误报，直接点「嵌入打开」即可。
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-xs text-muted">
                  端口
                  <input
                    value={ports[t.id] ?? String(t.port)}
                    onChange={(e) => savePort(t, e.target.value)}
                    inputMode="numeric"
                    className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </label>
                {t.tokenHash && (
                  <input
                    value={tokens[t.id] ?? ""}
                    onChange={(e) => saveToken(t.id, e.target.value)}
                    placeholder="访问令牌（可选，启动时终端输出）"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                )}
              </div>

              {t.tokenHash && t.tokenCommand && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-muted">获取/重置令牌</span>
                  <code className="flex-1 truncate text-muted">{t.tokenCommand}</code>
                  <button
                    onClick={() => copyText(`${t.id}-token`, t.tokenCommand!)}
                    className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-muted transition-colors hover:bg-hover hover:text-fg"
                  >
                    {copiedKey === `${t.id}-token` ? "已复制" : "复制"}
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-1 text-sm">
                <button
                  onClick={() => openTool(t.id)}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    activeId === t.id
                      ? "bg-accent font-medium text-white shadow-sm hover:bg-accent-hover"
                      : "border border-line text-muted hover:bg-subtle hover:text-fg"
                  }`}
                >
                  嵌入打开
                </button>
                <button
                  onClick={() => window.open(toolUrl(t, effPort(t), tokens[t.id] ?? ""), "_blank")}
                  className="rounded-lg border border-line px-3 py-1.5 text-muted transition-colors hover:bg-subtle hover:text-fg"
                >
                  新标签打开
                </button>
                {t.docs && (
                  <a href={t.docs} target="_blank" rel="noreferrer" className="px-2 py-1 text-accent hover:underline">
                    文档
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
        </div>
      )}

      {active ? (
        renderEmbed(false)
      ) : (
        <div className="m-4 flex flex-1 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
          点击「嵌入打开」将工具嵌入到此处使用（本机需已运行对应工具）
        </div>
      )}

      {maximized && renderEmbed(true)}
    </div>
  );
}

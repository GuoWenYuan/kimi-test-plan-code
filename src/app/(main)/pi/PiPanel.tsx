"use client";

import { useEffect, useRef, useState } from "react";
import { PI_COMMAND_GROUPS } from "./pi-commands";

interface Preset {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
}

interface ToolCall {
  tool: string;
  args: string;
  isError?: boolean;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  think: string;
  tools: ToolCall[];
  error?: boolean;
}

interface SessionMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const INDEX_KEY = "pi-sessions-index";
const CHAT_KEY = (id: string) => `pi-chat-${id}`;
const MAX_SESSIONS = 30;
const MAX_MESSAGES = 200;

function loadIndex(): SessionMeta[] {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as SessionMeta[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function loadMessages(id: string): Msg[] {
  try {
    const list = JSON.parse(localStorage.getItem(CHAT_KEY(id)) ?? "[]") as Msg[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 会话置顶/新建写入索引（同时落 localStorage），超出上限裁掉最旧并清其消息缓存 */
function upsertIndex(list: SessionMeta[], meta: SessionMeta): SessionMeta[] {
  const next = [meta, ...list.filter((s) => s.id !== meta.id)].slice(0, MAX_SESSIONS);
  const kept = new Set(next.map((s) => s.id));
  for (const s of list) if (!kept.has(s.id)) localStorage.removeItem(CHAT_KEY(s.id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  return next;
}

/** crypto.randomUUID 仅在安全上下文（https/localhost）可用，http 裸 IP 访问时退回 Math.random 版 */
function newSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 初始会话：恢复最近使用的会话（含消息），无历史则开新会话 */
function initialSession(): { id: string; messages: Msg[] } {
  if (typeof window !== "undefined") {
    const idx = loadIndex();
    if (idx[0]) return { id: idx[0].id, messages: loadMessages(idx[0].id) };
  }
  return { id: newSessionId(), messages: [] };
}

export default function PiPanel() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [sessions, setSessions] = useState<SessionMeta[]>(() =>
    typeof window === "undefined" ? [] : loadIndex()
  );
  const [sessionId, setSessionId] = useState(() => initialSession().id);
  const [messages, setMessages] = useState<Msg[]>(() => initialSession().messages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/models").catch(() => null);
      if (!res?.ok) return;
      const list = (await res.json()) as Preset[];
      setPresets(list);
      if (list.length > 0) setPresetId((prev) => prev || list[0].id);
    }
    load();
  }, []);

  // 消息变化即持久化到 localStorage（仅写存储，不触发 setState）
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(CHAT_KEY(sessionId), JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      /* 存储满等异常忽略 */
    }
  }, [messages, sessionId]);

  // 新内容时滚到底部（仅 DOM 操作，不触发 setState）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function patchLast(fn: (m: Msg) => Msg) {
    setMessages((list) => {
      if (list.length === 0) return list;
      const next = [...list];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !presetId) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text, think: "", tools: [] },
      { role: "assistant", text: "", think: "", tools: [] },
    ]);
    // 会话入索引：标题取首条用户消息，已有会话保留原标题
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === sessionId);
      return upsertIndex(prev, {
        id: sessionId,
        title: existing?.title ?? (text.slice(0, 30) || "新会话"),
        updatedAt: Date.now(),
      });
    });
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/pi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, presetId, sessionId }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `请求失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          try {
            handle(JSON.parse(line.slice(5)));
          } catch {
            /* 忽略无法解析的行 */
          }
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        patchLast((m) => ({
          ...m,
          error: true,
          text: m.text + (m.text ? "\n\n" : "") + `[错误] ${e instanceof Error ? e.message : String(e)}`,
        }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function handle(e: { type: string; text?: string; tool?: string; args?: string; isError?: boolean; message?: string }) {
    switch (e.type) {
      case "delta":
        patchLast((m) => ({ ...m, text: m.text + (e.text ?? "") }));
        break;
      case "think":
        patchLast((m) => ({ ...m, think: m.think + (e.text ?? "") }));
        break;
      case "tool_start":
        patchLast((m) => ({ ...m, tools: [...m.tools, { tool: e.tool ?? "tool", args: e.args ?? "" }] }));
        break;
      case "tool_end":
        patchLast((m) => {
          const tools = [...m.tools];
          // 从后往前找到同名未完成的调用标记结果
          for (let i = tools.length - 1; i >= 0; i--) {
            if (tools[i].tool === e.tool && tools[i].isError === undefined) {
              tools[i] = { ...tools[i], isError: Boolean(e.isError) };
              break;
            }
          }
          return { ...m, tools };
        });
        break;
      case "error":
        patchLast((m) => ({
          ...m,
          error: true,
          text: m.text + (m.text ? "\n\n" : "") + `[错误] ${e.message ?? "未知错误"}`,
        }));
        break;
      case "done":
        break;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newChat() {
    if (busy) return;
    setMessages([]);
    setSessionId(newSessionId());
  }

  function switchSession(id: string) {
    if (busy || id === sessionId) return;
    setSessionId(id);
    setMessages(loadMessages(id));
  }

  function deleteSession(id: string) {
    if (busy) return;
    localStorage.removeItem(CHAT_KEY(id));
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem(INDEX_KEY, JSON.stringify(next));
      return next;
    });
    // 删除的是当前会话则开新会话
    if (id === sessionId) {
      setMessages([]);
      setSessionId(newSessionId());
    }
  }

  return (
    <div className="flex h-full">
      {/* 会话列表（localStorage 持久化，切页签/刷新不丢） */}
      <div className="flex w-52 shrink-0 flex-col border-r border-line bg-card">
        <div className="border-b border-line p-2">
          <button
            onClick={newChat}
            disabled={busy}
            className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-fg transition-colors hover:bg-subtle disabled:opacity-50"
          >
            ＋ 新会话
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {sessions.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted">暂无历史会话</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                s.id === sessionId ? "bg-accent-soft text-accent" : "text-fg hover:bg-subtle"
              }`}
            >
              <button
                onClick={() => switchSession(s.id)}
                disabled={busy}
                className="min-w-0 flex-1 text-left disabled:opacity-50"
              >
                <div className="truncate">{s.title}</div>
                <div className="text-xs text-muted">{fmtTime(s.updatedAt)}</div>
              </button>
              <button
                onClick={() => deleteSession(s.id)}
                disabled={busy}
                title="删除会话"
                className="hidden shrink-0 text-muted hover:text-fg group-hover:block disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 聊天区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="text-sm font-semibold text-fg">Server-PIAgent</span>
          <span className="text-xs text-muted">服务端运行 · 仅 guowenyuan · 只访问服务器</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setCmdOpen((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                cmdOpen ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg hover:bg-subtle"
              }`}
              title="社区包斜杠命令（点击填入输入框）"
            >
              ⌘ 命令
            </button>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="rounded-lg border border-line bg-card px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            >
              {presets.length === 0 && <option value="">暂无模型预设</option>}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.model}）
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 消息区 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md text-center">
                <p className="text-sm text-muted">
                  在下方输入指令，Pi agent 将在服务器上执行（可读写本项目代码、运行命令）。
                </p>
                {presets.length === 0 && (
                  <p className="mt-2 text-sm text-muted">请先在「模型」页添加模型预设。</p>
                )}
              </div>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-accent-soft px-3.5 py-2 text-sm text-fg">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div
                    className={`max-w-[85%] rounded-xl border px-3.5 py-2 text-sm ${
                      m.error ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-line bg-card"
                    }`}
                  >
                    {m.think && (
                      <details className="mb-2">
                        <summary className="cursor-pointer text-xs text-muted">思考过程</summary>
                        <div className="mt-1 whitespace-pre-wrap text-xs text-muted">{m.think}</div>
                      </details>
                    )}
                    {m.tools.map((t, j) => (
                      <div key={j} className="mb-1 font-mono text-xs text-muted">
                        ⚙ {t.tool}
                        {t.args ? ` ${t.args}` : ""}
                        {t.isError === true && <span className="text-red-500"> ✗</span>}
                        {t.isError === false && <span className="text-green-600 dark:text-green-400"> ✓</span>}
                      </div>
                    ))}
                    <div className="whitespace-pre-wrap text-fg">
                      {m.text}
                      {busy && i === messages.length - 1 && <span className="animate-pulse text-muted">▍</span>}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-line p-4">
          {/* 命令面板：已装社区包的全部斜杠命令，点击填入输入框 */}
          {cmdOpen && (
            <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-line bg-card p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-muted">点击命令填入输入框（命令即消息，发送后生效；灰色为 TUI 专用，网页端不可用）</span>
                <button onClick={() => setCmdOpen(false)} className="text-xs text-muted hover:text-fg">✕</button>
              </div>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {PI_COMMAND_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="mb-1 text-xs font-medium text-muted">#{g.group}</div>
                    <div className="space-y-1">
                      {g.commands.map((c) => (
                        <button
                          key={c.cmd}
                          disabled={c.tuiOnly}
                          onClick={() => {
                            setInput(c.cmd + " ");
                            inputRef.current?.focus();
                          }}
                          title={c.tuiOnly ? "依赖终端界面，网页端不可用" : `填入 ${c.cmd}`}
                          className={`block w-full rounded-md px-2 py-1 text-left text-xs transition-colors ${
                            c.tuiOnly
                              ? "cursor-not-allowed text-muted/50"
                              : "text-fg hover:bg-accent-soft"
                          }`}
                        >
                          <code className={`font-mono ${c.tuiOnly ? "" : "text-accent"}`}>{c.cmd}</code>
                          <span className="text-muted">（{c.desc}）</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
              }}
              placeholder={presetId ? "输入指令，Enter 发送…" : "请先选择模型预设"}
              disabled={!presetId}
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
            />
            {busy ? (
              <button
                onClick={stop}
                className="shrink-0 rounded-lg border border-line bg-card px-4 py-2 text-sm text-fg hover:bg-subtle"
              >
                停止
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() || !presetId}
                className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

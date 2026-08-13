"use client";

import { useCallback, useEffect, useState } from "react";

interface QuickCommand {
  id: string;
  name: string;
  command: string;
  target: "local" | "server";
  timeout: number;
  createdAt: string;
}

interface LogEntry {
  time: string;
  name: string;
  target: string;
  exitCode: string;
  output: string;
  kind: "ok" | "error" | "info";
}

interface BridgeHealth {
  ok: boolean;
  name?: string;
  root?: string;
  run?: boolean;
}

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:39275";
const BRIDGE_URL_KEY = "commands-bridge-url";
const BRIDGE_TOKEN_KEY = "commands-bridge-token";
const EMPTY_FORM = { name: "", command: "", target: "local" as "local" | "server", timeout: 60 };

export default function CommandsPage() {
  const [commands, setCommands] = useState<QuickCommand[]>([]);
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showBridge, setShowBridge] = useState(false);
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth | null>(null);
  const [bridgeChecking, setBridgeChecking] = useState(false);
  const [bridgeError, setBridgeError] = useState("");

  // AI 生成（PIAgent 按需求生成指令并直接入库）
  const [showAi, setShowAi] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiTarget, setAiTarget] = useState<"local" | "server">("local");
  const [aiPresetId, setAiPresetId] = useState("");
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  // 桥地址与令牌存浏览器 localStorage，惰性初始化读取（仿 ToolsPanel）
  const [bridgeUrl, setBridgeUrl] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_BRIDGE_URL;
    return localStorage.getItem(BRIDGE_URL_KEY) ?? DEFAULT_BRIDGE_URL;
  });
  const [bridgeToken, setBridgeToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(BRIDGE_TOKEN_KEY) ?? "";
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/commands");
    const data = await res.json();
    setCommands(data.commands ?? []);
    setRole(data.role ?? "user");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载时拉取数据（异步 setState）
    refresh();
  }, [refresh]);

  const saveBridgeUrl = (value: string) => {
    setBridgeUrl(value);
    localStorage.setItem(BRIDGE_URL_KEY, value);
  };
  const saveBridgeToken = (value: string) => {
    setBridgeToken(value);
    localStorage.setItem(BRIDGE_TOKEN_KEY, value);
  };

  const appendLog = (entry: Omit<LogEntry, "time">) => {
    setLogs((prev) => [{ time: new Date().toLocaleTimeString(), ...entry }, ...prev]);
  };

  const checkBridge = async (): Promise<BridgeHealth | null> => {
    try {
      const res = await fetch(`${bridgeUrl}/health`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as BridgeHealth;
    } catch {
      return null;
    }
  };

  const detectBridge = async () => {
    setBridgeChecking(true);
    setBridgeError("");
    const health = await checkBridge();
    setBridgeHealth(health);
    if (!health) {
      setBridgeError(
        `无法访问 ${bridgeUrl}（桥不在线或被浏览器私网访问保护拦截）。请先在本机运行统一桥 workbench-bridge.mjs（下载见下方「本机桥设置」）。`
      );
    }
    setBridgeChecking(false);
  };

  const submit = async () => {
    setError("");
    if (!form.name.trim() || !form.command.trim()) {
      setError("名称与指令均为必填");
      return;
    }
    const url = editingId ? `/api/commands/${editingId}` : "/api/commands";
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

  const startEdit = (c: QuickCommand) => {
    setForm({ name: c.name, command: c.command, target: c.target, timeout: c.timeout });
    setEditingId(c.id);
    setShowForm(true);
    setError("");
  };

  const remove = async (c: QuickCommand) => {
    if (!confirm(`删除指令「${c.name}」？`)) return;
    await fetch(`/api/commands/${c.id}`, { method: "DELETE" });
    refresh();
  };

  /** 本机执行：浏览器直连统一桥（workbench-bridge）的 sys.run */
  const runLocal = async (c: QuickCommand) => {
    const health = await checkBridge();
    setBridgeHealth(health);
    if (!health) {
      appendLog({
        name: c.name,
        target: "本机",
        exitCode: "-",
        output: `无法访问 ${bridgeUrl}：本机桥不在线，或被浏览器私网访问保护（PNA）拦截。请确认本机已运行 workbench-bridge.mjs，并已在浏览器授予「本地网络访问」权限。`,
        kind: "error",
      });
      return;
    }
    if (health.run !== true) {
      appendLog({
        name: c.name,
        target: "本机",
        exitCode: "-",
        output: "本机桥未启用命令执行：请以 --allow-run 重启 workbench-bridge",
        kind: "error",
      });
      return;
    }
    try {
      const res = await fetch(`${bridgeUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": bridgeToken },
        body: JSON.stringify({ name: "sys.run", args: { command: c.command, timeout: c.timeout } }),
      });
      const data = await res.json();
      if (data.ok) {
        // sys.run 返回字符串 "退出码 N\n<输出>"
        const result = String(data.result ?? "");
        const m = result.match(/^退出码 (\S+)\n?/);
        appendLog({
          name: c.name,
          target: "本机",
          exitCode: m?.[1] ?? "0",
          output: m ? result.slice(m[0].length) : result,
          kind: m?.[1] === "0" ? "ok" : "error",
        });
      } else {
        appendLog({
          name: c.name,
          target: "本机",
          exitCode: "-",
          output: data.error ?? "执行失败",
          kind: "error",
        });
      }
    } catch {
      appendLog({
        name: c.name,
        target: "本机",
        exitCode: "-",
        output: "请求本机桥失败：桥可能已断开，或被浏览器拦截了对 127.0.0.1 的请求。",
        kind: "error",
      });
    }
  };

  /** 服务器执行：走服务端 API（仅超管） */
  const runServer = async (c: QuickCommand) => {
    try {
      const res = await fetch(`/api/commands/${c.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        appendLog({
          name: c.name,
          target: "服务器",
          exitCode: "-",
          output: data.error ?? `执行失败（HTTP ${res.status}）`,
          kind: "error",
        });
        return;
      }
      appendLog({
        name: c.name,
        target: "服务器",
        exitCode: String(data.exitCode ?? "?"),
        output: data.output ?? "",
        kind: data.ok ? "ok" : "error",
      });
    } catch {
      appendLog({
        name: c.name,
        target: "服务器",
        exitCode: "-",
        output: "请求服务器失败：网络异常",
        kind: "error",
      });
    }
  };

  const run = async (c: QuickCommand) => {
    setRunningId(c.id);
    try {
      if (c.target === "server") await runServer(c);
      else await runLocal(c);
    } finally {
      setRunningId(null);
    }
  };

  const isAdmin = role === "super_admin";

  const toggleAi = async () => {
    setShowAi((v) => !v);
    setShowForm(false);
    setAiError("");
    // 首次打开时拉模型预设列表（仅需 id/name，用于多预设时选择）
    if (presets.length === 0) {
      const res = await fetch("/api/models");
      if (res.ok) {
        const list = (await res.json()) as { id: string; name: string }[];
        setPresets(list.map((p) => ({ id: p.id, name: p.name })));
      }
    }
  };

  const generate = async () => {
    if (!aiText.trim()) {
      setAiError("请描述你的需求");
      return;
    }
    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch("/api/commands/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiText,
          target: aiTarget,
          ...(aiPresetId ? { presetId: aiPresetId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "生成失败");
        return;
      }
      setAiText("");
      setShowAi(false);
      refresh();
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-fg">快捷指令</h1>
          <p className="mt-1 text-sm text-muted">
            保存常用 shell 指令，一键在「本机」（经统一桥 workbench-bridge）或「服务器」（workbench 容器，仅管理员）执行。
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleAi} className="btn-ghost">
            {showAi ? "取消" : "✨ AI 生成"}
          </button>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setEditingId(null);
              setShowForm((v) => !v);
              setShowAi(false);
              setError("");
            }}
            className="btn-primary"
          >
            {showForm ? "取消" : "+ 新增指令"}
          </button>
        </div>
      </div>

      {/* AI 生成（PIAgent 按需求一句话生成并入库） */}
      {showAi && (
        <div className="mt-4 space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">需求描述</span>
            <textarea
              rows={2}
              value={aiText}
              placeholder="如：查看当前目录下最大的 10 个文件 / 每 5 秒看一次内存占用"
              onChange={(e) => setAiText(e.target.value)}
              className="input w-full resize-y"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">执行目标</span>
              <div className="flex gap-4 text-sm text-fg">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={aiTarget === "local"}
                    onChange={() => setAiTarget("local")}
                  />
                  本机（统一桥）
                </label>
                {isAdmin && (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={aiTarget === "server"}
                      onChange={() => setAiTarget("server")}
                    />
                    服务器（workbench 容器）
                  </label>
                )}
              </div>
            </div>
            {presets.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">模型预设</span>
                <select
                  value={aiPresetId}
                  onChange={(e) => setAiPresetId(e.target.value)}
                  className="input"
                >
                  <option value="">默认（首个预设）</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {aiError && <p className="text-sm text-danger">{aiError}</p>}
          <button onClick={generate} disabled={aiBusy} className="btn-primary">
            {aiBusy ? "生成中…" : "生成并保存"}
          </button>
        </div>
      )}

      {/* 本机桥设置（可折叠） */}
      <div className="mt-4 rounded-2xl border border-line bg-card p-4 shadow-card">
        <button
          onClick={() => setShowBridge((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-fg"
        >
          <span>本机桥设置（执行「本机」目标指令所需）</span>
          <span className="text-xs text-muted">{showBridge ? "收起 ▲" : "展开 ▼"}</span>
        </button>
        {showBridge && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted">
              在你的电脑上运行统一桥{" "}
              <a href="/api/bridge" className="text-accent hover:underline">
                workbench-bridge.mjs
              </a>
              （需带 --allow-run），地址与令牌仅保存在本浏览器 localStorage。这一个脚本同时覆盖远程设备心跳与知识库 MCP。
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">桥地址</span>
                <input
                  value={bridgeUrl}
                  onChange={(e) => saveBridgeUrl(e.target.value)}
                  placeholder={DEFAULT_BRIDGE_URL}
                  className="input w-full"
                />
              </label>
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">桥令牌（X-Bridge-Token）</span>
                <input
                  value={bridgeToken}
                  onChange={(e) => saveBridgeToken(e.target.value)}
                  placeholder="workbench-bridge 启动时打印的令牌"
                  className="input w-full"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={detectBridge} disabled={bridgeChecking} className="btn-ghost">
                {bridgeChecking ? "检测中…" : "检测连接"}
              </button>
              {bridgeHealth && (
                <span className="text-sm text-success">
                  在线：{bridgeHealth.name}（根目录 {bridgeHealth.root}）
                  {bridgeHealth.run ? "，命令执行已启用" : "，命令执行未启用（--allow-run）"}
                </span>
              )}
              {bridgeError && <span className="text-sm text-danger">{bridgeError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* 新建/编辑表单 */}
      {showForm && (
        <div className="mt-4 space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
          <div className="flex flex-wrap gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">名称</span>
              <input
                value={form.name}
                placeholder="如：查看磁盘占用"
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                className="input w-full"
              />
            </label>
            <label className="block w-32">
              <span className="mb-1 block text-xs font-medium text-muted">超时（秒）</span>
              <input
                type="number"
                min={1}
                max={300}
                value={form.timeout}
                onChange={(e) => setForm((v) => ({ ...v, timeout: Number(e.target.value) || 60 }))}
                className="input w-full"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">指令内容</span>
            <textarea
              rows={3}
              value={form.command}
              placeholder="如：df -h"
              onChange={(e) => setForm((v) => ({ ...v, command: e.target.value }))}
              className="input w-full resize-y font-mono"
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">执行目标</span>
            <div className="flex gap-4 text-sm text-fg">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={form.target === "local"}
                  onChange={() => setForm((v) => ({ ...v, target: "local" }))}
                />
                本机（统一桥）
              </label>
              {isAdmin && (
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.target === "server"}
                    onChange={() => setForm((v) => ({ ...v, target: "server" }))}
                  />
                  服务器（workbench 容器）
                </label>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button onClick={submit} className="btn-primary">
            {editingId ? "保存修改" : "创建指令"}
          </button>
        </div>
      )}

      {/* 指令列表 */}
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted">加载中…</p>
        ) : commands.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-card py-14 shadow-card">
            <div className="text-3xl">⌨️</div>
            <p className="mt-3 text-sm font-medium text-fg">还没有快捷指令</p>
            <p className="mt-1 text-sm text-muted">点击右上角「新增指令」创建。</p>
          </div>
        ) : (
          commands.map((c) => {
            const serverLocked = c.target === "server" && !isAdmin;
            return (
              <div key={c.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{c.name}</span>
                      <span className="chip">{c.target === "server" ? "服务器" : "本机"}</span>
                      <span className="chip">超时 {c.timeout}s</span>
                    </div>
                    <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-subtle p-2 font-mono text-xs text-muted">
                      {c.command}
                    </pre>
                    {serverLocked && (
                      <p className="mt-1.5 text-xs text-muted">仅管理员可在服务器执行</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2 text-sm">
                    <button
                      onClick={() => run(c)}
                      disabled={runningId !== null || serverLocked}
                      className="btn-primary"
                    >
                      {runningId === c.id ? "执行中…" : "运行"}
                    </button>
                    <button onClick={() => startEdit(c)} className="btn-ghost">
                      编辑
                    </button>
                    <button
                      onClick={() => remove(c)}
                      className="rounded-lg border border-danger/40 px-2.5 py-1 text-danger transition-colors hover:bg-danger/10"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 执行日志 */}
      {logs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-fg">执行日志</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-muted transition-colors hover:text-fg"
            >
              清空
            </button>
          </div>
          <div className="mt-2 max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-line bg-subtle p-3">
            {logs.map((log, i) => (
              <div key={i} className="rounded-lg border border-line bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">[{log.time}]</span>
                  <span className="font-medium text-fg">{log.name}</span>
                  <span className="chip">{log.target}</span>
                  <span className={log.kind === "error" ? "text-danger" : "text-success"}>
                    退出码 {log.exitCode}
                  </span>
                </div>
                {log.output && (
                  <pre
                    className={`mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs ${
                      log.kind === "error" ? "text-danger" : "text-muted"
                    }`}
                  >
                    {log.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

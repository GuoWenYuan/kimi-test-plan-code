"use client";

import { useState } from "react";

interface BridgeInfo {
  project: string;
  unity: string;
  commands: number;
}

interface BridgeCommand {
  name: string;
  description: string;
}

interface LogEntry {
  time: string;
  kind: "info" | "ok" | "error";
  text: string;
}

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:39271";

export default function UnityPage() {
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState<BridgeInfo | null>(null);
  const [commands, setCommands] = useState<BridgeCommand[]>([]);
  const [argsMap, setArgsMap] = useState<Record<string, string>>({});
  const [runningCmd, setRunningCmd] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const appendLog = (kind: LogEntry["kind"], text: string) => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), kind, text },
    ]);
  };

  const connect = async () => {
    setConnecting(true);
    setInfo(null);
    setCommands([]);
    try {
      const pingRes = await fetch(`${bridgeUrl}/ping`, { cache: "no-store" });
      if (!pingRes.ok) throw new Error(`HTTP ${pingRes.status}`);
      const ping = await pingRes.json();
      setInfo({ project: ping.project, unity: ping.unity, commands: ping.commands });

      const cmdRes = await fetch(`${bridgeUrl}/commands`, { cache: "no-store" });
      const data = await cmdRes.json();
      setCommands(data.commands ?? []);
      appendLog("info", `已连接到 ${bridgeUrl}（项目：${ping.project}，Unity ${ping.unity}）`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      appendLog(
        "error",
        `连接失败：无法访问 ${bridgeUrl}（${detail}）。请确认本机 Unity Editor 已打开且 Unity Bridge 已启动；`
        + "若 Unity 端已确认运行，请在浏览器地址栏直接打开 "
        + `${bridgeUrl}/ping 验证，并检查系统代理/VPN 是否拦截了对 127.0.0.1 的请求。`
      );
    } finally {
      setConnecting(false);
    }
  };

  const execute = async (name: string) => {
    setRunningCmd(name);
    try {
      const res = await fetch(`${bridgeUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, args: argsMap[name] ?? "" }),
      });
      const data = await res.json();
      if (data.ok) {
        appendLog("ok", `[${name}] ${data.result || "执行成功"}`);
      } else {
        appendLog("error", `[${name}] ${data.error ?? "执行失败"}`);
      }
    } catch {
      appendLog("error", `[${name}] 请求失败，桥接可能已断开`);
    } finally {
      setRunningCmd(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Unity 控制</h1>
      <p className="mt-1 text-sm text-neutral-500">
        通过本机 Unity Bridge 插件操控你电脑上的 Unity Editor。请先{" "}
        <a href="/api/unity-bridge" className="text-blue-600 hover:underline">
          下载 UnityBridge.cs
        </a>
        ，放入 Unity 工程的 <code className="rounded bg-neutral-100 px-1">Assets/Editor/</code>{" "}
        目录（详见 <code className="rounded bg-neutral-100 px-1">unity-bridge/README.md</code>）。
      </p>

      {/* 连接区 */}
      <div className="mt-4 flex items-center gap-2">
        <input
          value={bridgeUrl}
          onChange={(e) => setBridgeUrl(e.target.value)}
          className="w-64 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          placeholder={DEFAULT_BRIDGE_URL}
        />
        <button
          onClick={connect}
          disabled={connecting}
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {connecting ? "连接中…" : info ? "重新连接" : "连接本机 Unity"}
        </button>
        {info && (
          <span className="text-sm text-green-700">
            已连接：{info.project}（Unity {info.unity}，{info.commands} 个命令）
          </span>
        )}
      </div>

      {/* 命令列表 */}
      {commands.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700">可用命令</h2>
          {commands.map((cmd) => (
            <div key={cmd.name} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900">{cmd.name}</div>
                  <p className="mt-0.5 text-xs text-neutral-400">{cmd.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    value={argsMap[cmd.name] ?? ""}
                    onChange={(e) => setArgsMap((m) => ({ ...m, [cmd.name]: e.target.value }))}
                    placeholder="参数（可空）"
                    className="w-44 rounded-md border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => execute(cmd.name)}
                    disabled={runningCmd !== null}
                    className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {runningCmd === cmd.name ? "执行中…" : "执行"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 日志 */}
      {logs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">执行日志</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              清空
            </button>
          </div>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs">
            {logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.kind === "error"
                    ? "text-rose-600"
                    : log.kind === "ok"
                      ? "text-green-700"
                      : "text-neutral-600"
                }
              >
                [{log.time}] {log.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

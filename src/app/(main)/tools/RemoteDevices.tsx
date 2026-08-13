"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_TOOLS } from "@/lib/ai-tools";
import type { DeviceEndpoint, DeviceWithStatus } from "@/lib/devices-store";

/**
 * /tools 页「远程设备」区块：展示同账号下各机器统一桥（workbench-bridge）心跳上报的工具，
 * 点击经 frp 穿透地址新标签打开该机器上工具的完整 Web 界面（手机场景主入口）。
 * 数据源 GET /api/devices，每 10s 轮询。
 */

const deviceTokenKey = (deviceId: string, idx: number) => `ai-device-token-${deviceId}-${idx}`;

/** tokenHash 类工具（如 kimi-web）打开时把令牌拼进 URL hash；未知 toolId 有令牌也按 #token= 拼 */
function endpointUrl(ep: DeviceEndpoint, token: string): string {
  const tool = AI_TOOLS.find((t) => t.id === ep.toolId);
  const useHash = tool ? Boolean(tool.tokenHash) : Boolean(token);
  return useHash && token ? `${ep.remoteUrl}#token=${encodeURIComponent(token)}` : ep.remoteUrl;
}

function lastSeenText(lastSeen: number): string {
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(lastSeen).toLocaleString();
}

export default function RemoteDevices() {
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 服务端未存令牌的端点，本地（本浏览器）输入的令牌，存 localStorage
  const [tokens, setTokens] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    const saved: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("ai-device-token-")) saved[k] = localStorage.getItem(k) ?? "";
    }
    return saved;
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/devices").catch(() => null);
    if (res?.ok) setDevices((await res.json()) as DeviceWithStatus[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // 首次挂载拉取设备列表，之后每 10s 轮询在线状态
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载拉数据的惯用法，load 内部为异步 setState
    load();
    const timer = setInterval(() => load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  function tokenFor(d: DeviceWithStatus, idx: number, ep: DeviceEndpoint): string {
    return ep.token ?? tokens[deviceTokenKey(d.id, idx)] ?? "";
  }

  function saveToken(d: DeviceWithStatus, idx: number, value: string) {
    const key = deviceTokenKey(d.id, idx);
    setTokens((m) => ({ ...m, [key]: value }));
    localStorage.setItem(key, value);
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

  async function removeDevice(d: DeviceWithStatus) {
    if (!window.confirm(`删除设备「${d.name}」？（机器重新心跳会再次出现）`)) return;
    const res = await fetch(`/api/devices/${d.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) load();
  }

  const configSample = JSON.stringify(
    {
      workbench: {
        url: typeof window === "undefined" ? "" : location.origin,
        apiToken: "<个人API令牌：知识库页「MCP 接入」区获取>",
      },
      device: {
        name: "公司电脑",
        endpoints: [
          { toolId: "kimi-web", label: "Kimi Web UI", localPort: 58627, remoteUrl: "http://<frps地址>:39101" },
        ],
      },
    },
    null,
    2
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-fg">远程设备</h2>
        <p className="mt-1 text-sm text-muted">
          其他电脑（公司/家里）运行 device-agent 心跳上报的本机工具，在此经 frp 穿透地址远程打开完整界面——手机登录同账号即可操作。搭建见
          <code className="mx-1 text-xs">docs/remote-devices.md</code>。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((d) => (
          <div key={d.id} className="space-y-2 rounded-2xl border border-line bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <span className="font-medium text-fg">{d.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  d.online
                    ? "bg-success/15 text-success"
                    : "bg-subtle text-muted"
                }`}
              >
                {d.online ? "在线" : "离线"}
              </span>
            </div>
            <p className="text-xs text-muted">最后心跳：{lastSeenText(d.lastSeen)}</p>

            <div className="space-y-2">
              {d.endpoints.map((ep, idx) => {
                const url = endpointUrl(ep, tokenFor(d, idx, ep));
                const usable = d.online;
                return (
                  <div key={idx} className="space-y-1.5 rounded-md border border-line p-2">
                    <div className="flex items-center gap-1.5 text-sm text-fg">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          ep.online ? "bg-success" : "bg-muted/40"
                        }`}
                      />
                      {ep.label}
                      <span className="text-xs text-muted">本机:{ep.localPort}</span>
                    </div>
                    {!ep.token && (
                      <input
                        value={tokens[deviceTokenKey(d.id, idx)] ?? ""}
                        onChange={(e) => saveToken(d, idx, e.target.value)}
                        placeholder="访问令牌（如工具需要）"
                        className="w-full rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                      />
                    )}
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={() => window.open(url, "_blank")}
                        disabled={!usable}
                        className={`rounded-lg px-3 py-1 transition-colors ${
                          usable
                            ? "bg-accent font-medium text-white shadow-sm hover:bg-accent-hover"
                            : "cursor-not-allowed border border-line text-muted opacity-50"
                        }`}
                      >
                        打开
                      </button>
                      <button
                        onClick={() => copyText(`${d.id}-${idx}`, url)}
                        className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
                      >
                        {copiedKey === `${d.id}-${idx}` ? "已复制" : "复制链接"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => removeDevice(d)}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                删除设备
              </button>
            </div>
          </div>
        ))}

        {/* 接入新设备说明卡 */}
        <div className="space-y-2 rounded-2xl border border-dashed border-line bg-card p-4 shadow-card">
          <span className="font-medium text-fg">接入新设备</span>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
            <li>
              在要接入的电脑上下载统一桥{" "}
              <a href="/api/bridge" className="text-accent hover:underline">
                workbench-bridge.mjs
              </a>
              ，并按 frp 文档暴露工具端口
            </li>
            <li>在同目录新建 bridge.json（右侧模板一键复制，url 已填当前站点）</li>
            <li>
              运行 <code className="text-fg">node workbench-bridge.mjs --no-serve</code>（常驻可 pm2 / nohup）
            </li>
          </ol>
          <button
            onClick={() => copyText("config-sample", configSample)}
            className="rounded-lg border border-line px-3 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
          >
            {copiedKey === "config-sample" ? "已复制" : "复制 bridge.json 模板"}
          </button>
        </div>
      </div>

      {loaded && devices.length === 0 && (
        <p className="text-xs text-muted">暂无设备：按上方「接入新设备」在公司/家里电脑部署后，此处自动出现。</p>
      )}
    </div>
  );
}

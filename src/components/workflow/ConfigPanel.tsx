"use client";

import { useEffect, useState } from "react";
import { NODE_DEFS } from "./nodeDefs";
import type { WorkNode } from "./WorkNodeView";

interface ModelPreset {
  id: string;
  name: string;
  model: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  group: string;
}

interface CustomNodeDefLite {
  id: string;
  name: string;
  description: string;
  mode: "llm" | "code";
  content: string;
}

interface UnityCommand {
  name: string;
  description: string;
}

const DEFAULT_UNITY_BRIDGE = "http://127.0.0.1:39271";

/**
 * 各桥地址最近一次读取到的指令列表（模块级缓存）。
 * 配置面板随节点选择卸载/重挂时 state 会清空，有缓存后重新点开节点
 * 下拉列表立即恢复，不必每次重新点「读取本机 Unity 指令」。
 * SPA 页面切换不销毁模块，缓存一直有效；整页刷新后需重新读取一次。
 */
const unityCmdCache = new Map<string, UnityCommand[]>();

interface Props {
  node: WorkNode | null;
  onChange: (id: string, patch: { label?: string; config?: Record<string, string> }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function ConfigPanel({ node, onChange, onDelete, onClose }: Props) {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [customDefs, setCustomDefs] = useState<CustomNodeDefLite[]>([]);
  const [unityCmds, setUnityCmds] = useState<UnityCommand[]>([]);
  /** unityCmds 对应的桥地址；切到别的 unity 节点（桥地址不同）时不误用旧列表 */
  const [unityCmdsBase, setUnityCmdsBase] = useState("");
  const [unityLoading, setUnityLoading] = useState(false);
  const [unityError, setUnityError] = useState("");

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => setPresets(Array.isArray(data) ? data : []))
      .catch(() => setPresets([]));
    fetch("/api/prompts")
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data?.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
    fetch("/api/custom-nodes")
      .then((r) => r.json())
      .then((data) => setCustomDefs(Array.isArray(data) ? data : []))
      .catch(() => setCustomDefs([]));
  }, []);

  if (!node) return null;
  const def = NODE_DEFS[node.data.kind];
  const customDef =
    node.data.kind === "custom"
      ? customDefs.find((d) => d.id === node.data.config.customId)
      : undefined;

  const importTemplate = () => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    onChange(node.id, { config: { ...node.data.config, prompt: tpl.content } });
    setTemplateId("");
  };

  // unity 节点当前桥地址；state 里的列表只属于最近一次成功读取的桥地址，
  // 其余情况（面板重开、切到别的 unity 节点）回退到模块级缓存
  const unityBase =
    node.data.kind === "unity"
      ? (node.data.config.bridgeUrl ?? "").trim() || DEFAULT_UNITY_BRIDGE
      : "";
  const unityCmdList =
    node.data.kind === "unity"
      ? unityCmdsBase === unityBase
        ? unityCmds
        : unityCmdCache.get(unityBase) ?? []
      : [];

  /** 浏览器直连本机 Unity Bridge，拉取可用指令列表 */
  const loadUnityCommands = async () => {
    if (!node) return;
    const base = (node.data.config.bridgeUrl ?? "").trim() || DEFAULT_UNITY_BRIDGE;
    setUnityLoading(true);
    setUnityError("");
    try {
      const res = await fetch(`${base}/commands`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: UnityCommand[] = Array.isArray(data?.commands) ? data.commands : [];
      setUnityCmds(list);
      setUnityCmdsBase(base);
      unityCmdCache.set(base, list);
      if (list.length === 0) setUnityError("桥端没有可用指令");
    } catch {
      // 失败时保留已有列表（state/缓存），仅提示连接失败
      setUnityError("连接失败：请确认本机 Unity Editor 已打开且 Unity Bridge 已启动（可在「Unity 控制」页测试连接）");
    } finally {
      setUnityLoading(false);
    }
  };

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded text-xs text-white ${def.color}`}
          >
            {def.icon}
          </span>
          <span className="text-sm font-medium text-fg">{def.title}节点</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">节点名称</span>
          <input
            value={node.data.label}
            onChange={(e) => onChange(node.id, { label: e.target.value })}
            className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </label>

        {node.data.kind !== "start" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              输入取值（可选）
            </span>
            <input
              value={node.data.config.inputPath ?? ""}
              placeholder="留空接收上游全部；填路径如 name、items.0、节点名.result 则只接收该值"
              onChange={(e) =>
                onChange(node.id, {
                  config: { ...node.data.config, inputPath: e.target.value },
                })
              }
              className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <span className="mt-1 block text-xs text-muted">
              声明本节点只接收上游输出中的某个字段，取不到时运行报错。节点输出一律为
              JSON：纯文本会被包装为 {"{\"text\": \"...\"}"}（填 text 取值），数字/布尔为 {"{\"value\": ...}"}。
            </span>
          </label>
        )}

        {node.data.kind !== "start" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              输入格式（可选）
            </span>
            <textarea
              rows={2}
              value={node.data.config.inputFormat ?? ""}
              placeholder='本节点接受的数据格式说明或示例，如 {"name":"物体名"} 或 纯文本：Unity 物体名'
              onChange={(e) =>
                onChange(node.id, {
                  config: { ...node.data.config, inputFormat: e.target.value },
                })
              }
              className="w-full resize-y rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <span className="mt-1 block text-xs text-muted">
              声明本节点接受什么格式；上游接「格式转换」节点时会读取此声明自动转换。
            </span>
          </label>
        )}

        {node.data.kind === "custom" && customDef && (
          <>
            <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/50 p-3 text-xs text-muted dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10">
              <div className="font-medium text-fuchsia-700 dark:text-fuchsia-400">
                {customDef.mode === "llm" ? "✨ 大模型节点" : "🧮 代码节点"}
              </div>
              <div className="mt-1">{customDef.description}</div>
              <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-card p-2">
                {customDef.content}
              </pre>
            </div>
            {customDef.mode === "llm" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">模型</span>
                <select
                  value={node.data.config.presetId ?? ""}
                  onChange={(e) =>
                    onChange(node.id, {
                      config: { ...node.data.config, presetId: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                >
                  <option value="">未选择</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.model}）
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {node.data.kind === "unity" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">桥接地址</span>
              <input
                value={node.data.config.bridgeUrl ?? ""}
                placeholder={DEFAULT_UNITY_BRIDGE}
                onChange={(e) =>
                  onChange(node.id, {
                    config: { ...node.data.config, bridgeUrl: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            <div>
              <button
                onClick={loadUnityCommands}
                disabled={unityLoading}
                className="w-full rounded-lg border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
              >
                {unityLoading ? "读取中…" : "读取本机 Unity 指令"}
              </button>
              {unityError && <p className="mt-1 text-xs text-red-500">{unityError}</p>}
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Unity 指令</span>
              <select
                value={node.data.config.command ?? ""}
                onChange={(e) =>
                  onChange(node.id, {
                    config: { ...node.data.config, command: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
              >
                <option value="">未选择（先点上方按钮读取）</option>
                {/* 已保存但当前不在桥端列表中的指令也保留显示，避免配置丢失 */}
                {node.data.config.command &&
                  !unityCmdList.some((c) => c.name === node.data.config.command) && (
                    <option value={node.data.config.command}>
                      {node.data.config.command}（桥端未找到）
                    </option>
                  )}
                {unityCmdList.map((c) => (
                  <option key={c.name} value={c.name} title={c.description}>
                    {c.name}
                  </option>
                ))}
              </select>
              {node.data.config.command && (
                <span className="mt-1 block text-xs text-muted">
                  {unityCmdList.find((c) => c.name === node.data.config.command)?.description ?? ""}
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">指令参数</span>
              <textarea
                rows={3}
                value={node.data.config.args ?? ""}
                placeholder="传给指令的参数字符串，可用 {{input}} / {{节点名}} / {{knowledge}} 引用数据；留空则直接使用上游输出作为参数"
                onChange={(e) =>
                  onChange(node.id, {
                    config: { ...node.data.config, args: e.target.value },
                  })
                }
                className="w-full resize-y rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
          </>
        )}

        {def.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              {field.label}
            </span>
            {field.type === "model" ? (
              <>
                <select
                  value={node.data.config[field.key] ?? ""}
                  onChange={(e) =>
                    onChange(node.id, {
                      config: { ...node.data.config, [field.key]: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                >
                  <option value="">未选择</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.model}）
                    </option>
                  ))}
                </select>
                {presets.length === 0 && (
                  <span className="mt-1 block text-xs text-muted">
                    暂无预设，请先到「模型」页添加。
                  </span>
                )}
              </>
            ) : field.multiline ? (
              <>
                {field.key === "prompt" && (
                  <div className="mb-1.5 flex gap-1.5">
                    <select
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                    >
                      <option value="">选择提示词模板…</option>
                      {[...new Set(templates.map((t) => t.group))].map((g) => (
                        <optgroup key={g} label={g}>
                          {templates
                            .filter((t) => t.group === g)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={importTemplate}
                      disabled={!templateId}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-40"
                    >
                      导入
                    </button>
                  </div>
                )}
                <textarea
                  rows={4}
                  value={node.data.config[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    onChange(node.id, {
                      config: { ...node.data.config, [field.key]: e.target.value },
                    })
                  }
                  className="w-full resize-y rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </>
            ) : (
              <input
                value={node.data.config[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) =>
                  onChange(node.id, {
                    config: { ...node.data.config, [field.key]: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            )}
          </label>
        ))}
      </div>

      {node.data.kind !== "start" && node.data.kind !== "end" && (
        <div className="border-t border-line p-3">
          <button
            onClick={() => onDelete(node.id)}
            className="w-full rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/25 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            删除节点
          </button>
        </div>
      )}
    </div>
  );
}

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

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded text-xs text-white ${def.color}`}
          >
            {def.icon}
          </span>
          <span className="text-sm font-medium text-neutral-800">{def.title}节点</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">节点名称</span>
          <input
            value={node.data.label}
            onChange={(e) => onChange(node.id, { label: e.target.value })}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </label>

        {node.data.kind === "custom" && customDef && (
          <>
            <div className="rounded-md border border-fuchsia-100 bg-fuchsia-50/50 p-3 text-xs text-neutral-600">
              <div className="font-medium text-fuchsia-700">
                {customDef.mode === "llm" ? "✨ 大模型节点" : "🧮 代码节点"}
              </div>
              <div className="mt-1">{customDef.description}</div>
              <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-white p-2">
                {customDef.content}
              </pre>
            </div>
            {customDef.mode === "llm" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">模型</span>
                <select
                  value={node.data.config.presetId ?? ""}
                  onChange={(e) =>
                    onChange(node.id, {
                      config: { ...node.data.config, presetId: e.target.value },
                    })
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
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

        {def.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">
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
                  className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                >
                  <option value="">未选择</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.model}）
                    </option>
                  ))}
                </select>
                {presets.length === 0 && (
                  <span className="mt-1 block text-xs text-neutral-400">
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
                      className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
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
                      className="shrink-0 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
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
                  className="w-full resize-y rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
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
                className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            )}
          </label>
        ))}
      </div>

      {node.data.kind !== "start" && node.data.kind !== "end" && (
        <div className="border-t border-neutral-100 p-3">
          <button
            onClick={() => onDelete(node.id)}
            className="w-full rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 transition-colors hover:bg-rose-50"
          >
            删除节点
          </button>
        </div>
      )}
    </div>
  );
}

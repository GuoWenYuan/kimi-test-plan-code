"use client";

import { useEffect, useState } from "react";

interface ModelPreset {
  id: string;
  name: string;
  model: string;
}

interface GenGraph {
  nodes: unknown[];
  edges: unknown[];
}

interface Props {
  onApply: (graph: GenGraph, tag: string) => void;
  onClose: () => void;
}

export default function AiGeneratePanel({ onApply, onClose }: Props) {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [requirement, setRequirement] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPresets(list);
        if (list.length > 0) setPresetId(list[0].id);
      })
      .catch(() => setPresets([]));
  }, []);

  const generate = async () => {
    if (!requirement.trim()) {
      setError("请先描述你的需求");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: requirement.trim(), presetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "生成失败");
        return;
      }
      if (!confirm("生成完成，将覆盖当前画布，确定应用？")) return;
      onApply(data.graph, tag.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-fg">✨ AI 生成工作流</span>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">模型</span>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
          >
            {presets.length === 0 && <option value="">请先到「模型」页添加预设</option>}
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.model}）
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">需求描述</span>
          <textarea
            rows={6}
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            placeholder="如：输入一段文本，先用大模型做摘要，再用代码统计字数，如果超过100字就走人工复核分支"
            className="w-full resize-y rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            标签（可选，生成后自动存为带标签的模板）
          </span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="如：文本处理"
            className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="border-t border-line p-4">
        <button
          onClick={generate}
          disabled={loading || !presetId}
          className="w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "生成中…" : "✨ 生成工作流"}
        </button>
      </div>
    </div>
  );
}

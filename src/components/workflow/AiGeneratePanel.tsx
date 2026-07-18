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
    <div className="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="text-sm font-medium text-neutral-800">✨ AI 生成工作流</span>
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
          <span className="mb-1 block text-xs font-medium text-neutral-500">模型</span>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
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
          <span className="mb-1 block text-xs font-medium text-neutral-500">需求描述</span>
          <textarea
            rows={6}
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            placeholder="如：输入一段文本，先用大模型做摘要，再用代码统计字数，如果超过100字就走人工复核分支"
            className="w-full resize-y rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">
            标签（可选，生成后自动存为带标签的模板）
          </span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="如：文本处理"
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </label>

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      <div className="border-t border-neutral-100 p-4">
        <button
          onClick={generate}
          disabled={loading || !presetId}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "生成中…" : "✨ 生成工作流"}
        </button>
      </div>
    </div>
  );
}

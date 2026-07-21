"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CREATABLE_NODES, type NodeKind } from "./nodeDefs";
import type { CustomNodeDef } from "@/lib/custom-nodes-store";

interface ModelPreset {
  id: string;
  name: string;
  model: string;
}

interface Props {
  onAdd: (kind: NodeKind) => void;
  onAddCustom: (def: CustomNodeDef) => void;
}

export default function NodePalette({ onAdd, onAddCustom }: Props) {
  const [customNodes, setCustomNodes] = useState<CustomNodeDef[]>([]);
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [genOpen, setGenOpen] = useState(false);
  const [requirement, setRequirement] = useState("");
  const [presetId, setPresetId] = useState("");
  const [tag, setTag] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 上传本地 skill 文件（.md/.txt），作为 llm 类自定义节点 */
  const uploadSkill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setGenError("");
    try {
      const content = await file.text();
      const name = file.name.replace(/\.(md|txt)$/i, "");
      const res = await fetch("/api/custom-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: `Skill：${name}`,
          tag: tag.trim() || "Skill",
          mode: "llm",
          content: `请严格遵循以下 Skill 指引处理输入：\n\n${content}`,
        }),
      });
      if (!res.ok) {
        setGenError((await res.json()).error ?? "上传失败");
        return;
      }
      setGenOpen(false);
      refresh();
    } finally {
      setUploading(false);
    }
  };

  const refresh = () => {
    fetch("/api/custom-nodes")
      .then((r) => r.json())
      .then((data) => setCustomNodes(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPresets(list);
        if (list.length > 0) setPresetId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, CustomNodeDef[]>();
    for (const n of customNodes) {
      map.set(n.tag, [...(map.get(n.tag) ?? []), n]);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === "默认" ? 1 : b === "默认" ? -1 : a.localeCompare(b, "zh")
    );
  }, [customNodes]);

  // 内置可创建节点：无 group 的为基础节点，有 group 的按标签分组（如"外部工具"）
  const basicNodes = CREATABLE_NODES.filter((d) => !d.group);
  const builtinGroups = useMemo(() => {
    const map = new Map<string, typeof CREATABLE_NODES>();
    for (const d of CREATABLE_NODES) {
      if (d.group) map.set(d.group, [...(map.get(d.group) ?? []), d]);
    }
    return [...map.entries()];
  }, []);

  const renderNodeButton = (def: (typeof CREATABLE_NODES)[number]) => (
    <button
      key={def.kind}
      onClick={() => onAdd(def.kind)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/workbench-node", def.kind);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex w-full cursor-grab items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-subtle active:cursor-grabbing"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm text-white ${def.color}`}
      >
        {def.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{def.title}</span>
        <span className="block truncate text-xs text-muted">{def.description}</span>
      </span>
    </button>
  );

  const generate = async () => {
    if (!requirement.trim()) {
      setGenError("请描述节点要做什么");
      return;
    }
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/custom-nodes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: requirement.trim(), presetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? "生成失败");
        return;
      }
      const save = await fetch("/api/custom-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data.spec, tag: tag.trim() || "默认" }),
      });
      if (!save.ok) {
        setGenError((await save.json()).error ?? "保存失败");
        return;
      }
      setRequirement("");
      setGenOpen(false);
      refresh();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const removeCustom = async (id: string) => {
    if (!confirm("删除该自定义节点？画布中已使用的实例会在运行时报错。")) return;
    await fetch(`/api/custom-nodes/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-line bg-card">
      <div className="border-b border-line px-4 py-3 text-xs font-medium text-muted">
        添加节点（点击或拖入画布）
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {basicNodes.map(renderNodeButton)}

        {/* 内置分组节点（如"外部工具"） */}
        {builtinGroups.map(([g, defs]) => (
          <div key={g}>
            <div className="px-3 pb-1 pt-3 text-xs font-medium text-muted">#{g}</div>
            {defs.map(renderNodeButton)}
          </div>
        ))}

        {/* 自定义节点：按标签分组 */}
        {groups.length > 0 && (
          <div className="px-3 pb-1 pt-3 text-xs font-medium text-muted">自定义节点</div>
        )}
        {groups.map(([g, items]) => (
          <div key={g}>
            <div className="px-3 py-1 text-xs text-muted">#{g}</div>
            {items.map((def) => (
              <div key={def.id} className="group relative">
                <button
                  onClick={() => onAddCustom(def)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/workbench-node", `custom:${def.id}`);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex w-full cursor-grab items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent-soft active:cursor-grabbing"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm text-white bg-fuchsia-500">
                    {def.mode === "llm" ? "✨" : "🧮"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{def.name}</span>
                    <span className="block truncate text-xs text-muted">{def.description}</span>
                  </span>
                </button>
                <button
                  onClick={() => removeCustom(def.id)}
                  className="absolute right-2 top-2 hidden text-xs text-muted transition-colors hover:text-red-500 group-hover:block"
                  title="删除自定义节点"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* AI 生成节点 */}
      <div className="border-t border-line p-2">
        {!genOpen ? (
          <button
            onClick={() => setGenOpen(true)}
            className="w-full rounded-md border border-dashed border-accent/50 px-3 py-2 text-xs text-accent transition-colors hover:bg-accent-soft"
          >
            ✨ AI 生成节点
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-accent/25 bg-accent-soft/50 p-2">
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="w-full rounded-md border border-line bg-card px-2 py-1 text-xs text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              {presets.length === 0 && <option value="">先到「模型」页添加预设</option>}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.model}）
                </option>
              ))}
            </select>
            <textarea
              rows={3}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="描述节点要做什么，如：把输入文本翻译成英文"
              className="w-full resize-y rounded-md border border-line bg-card px-2 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="标签（可选，如：文本处理）"
              className="w-full rounded-md border border-line bg-card px-2 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            {genError && <p className="text-xs text-red-500">{genError}</p>}
            <div className="flex gap-1">
              <button
                onClick={generate}
                disabled={generating || !presetId}
                className="flex-1 rounded-md bg-accent px-2 py-1 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {generating ? "生成中…" : "生成"}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 rounded-md border border-accent/50 px-2 py-1 text-xs text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
                title="上传本地 skill 文件（.md/.txt）作为节点"
              >
                {uploading ? "上传中…" : "上传 Skill"}
              </button>
              <button
                onClick={() => setGenOpen(false)}
                className="rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                取消
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              className="hidden"
              onChange={uploadSkill}
            />
          </div>
        )}
      </div>
    </div>
  );
}

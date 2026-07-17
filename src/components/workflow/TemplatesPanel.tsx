"use client";

import { useCallback, useEffect, useState } from "react";

interface WorkflowGraph {
  nodes: unknown[];
  edges: unknown[];
  knowledge: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  graph: WorkflowGraph;
  createdAt: string;
}

interface Props {
  getGraph: () => WorkflowGraph;
  onImport: (graph: WorkflowGraph) => void;
  onClose: () => void;
}

export default function TemplatesPanel({ getGraph, onImport, onClose }: Props) {
  const [list, setList] = useState<WorkflowTemplate[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workflows");
    const data = await res.json();
    setList(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveCurrent = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), graph: getGraph() }),
    });
    setSaving(false);
    setName("");
    refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="text-sm font-medium text-neutral-800">工作流模板</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-neutral-100 p-4">
        <span className="mb-1 block text-xs font-medium text-neutral-500">
          把当前画布存为模板（含节点、连线、知识库）
        </span>
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
            placeholder="模板名称"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
          />
          <button
            onClick={saveCurrent}
            disabled={saving || !name.trim()}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
          >
            存为模板
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {list.length === 0 ? (
          <p className="text-center text-xs text-neutral-400">暂无模板，先把当前画布存一个吧。</p>
        ) : (
          list.map((t) => (
            <div key={t.id} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium text-neutral-800">{t.name}</span>
                <span className="ml-2 shrink-0 text-xs text-neutral-400">
                  {new Date(t.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {t.graph.nodes.length} 个节点 · {t.graph.edges.length} 条连线
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    if (confirm(`导入「${t.name}」将覆盖当前画布，确定？`)) {
                      onImport(t.graph);
                    }
                  }}
                  className="flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  一键导入
                </button>
                <button
                  onClick={() => remove(t.id)}
                  className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

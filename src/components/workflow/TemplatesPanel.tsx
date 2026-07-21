"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface WorkflowGraph {
  nodes: unknown[];
  edges: unknown[];
  knowledge: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  tag: string;
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
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workflows");
    const data = await res.json();
    setList(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载时拉取数据（异步 setState）
    refresh();
  }, [refresh]);

  const groups = useMemo(() => {
    const map = new Map<string, WorkflowTemplate[]>();
    for (const t of list) {
      const g = t.tag || "默认";
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === "默认" ? 1 : b === "默认" ? -1 : a.localeCompare(b, "zh")
    );
  }, [list]);

  const saveCurrent = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        tag: tag.trim() || "默认",
        graph: getGraph(),
      }),
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
    <div className="flex w-80 shrink-0 flex-col border-l border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-fg">工作流模板</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 border-b border-line p-4">
        <span className="block text-xs font-medium text-muted">
          把当前画布存为模板（含节点、连线、知识库）
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="模板名称"
          className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <div className="flex gap-1.5">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
            placeholder="标签（可选，如：文本处理）"
            className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <button
            onClick={saveCurrent}
            disabled={saving || !name.trim()}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            存为模板
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-4">
        {list.length === 0 ? (
          <p className="text-center text-xs text-muted">暂无模板，先把当前画布存一个吧。</p>
        ) : (
          groups.map(([g, items]) => {
            const isCollapsed = collapsed[g] ?? false;
            return (
              <div key={g}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g]: !isCollapsed }))}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
                >
                  <span>{isCollapsed ? "▸" : "▾"} {g}</span>
                  <span className="text-muted">{items.length}</span>
                </button>
                {!isCollapsed &&
                  items.map((t) => (
                    <div key={t.id} className="mb-2 rounded-xl border border-line bg-card p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                        <span className="ml-2 shrink-0 text-xs text-muted">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {t.graph.nodes.length} 个节点 · {t.graph.edges.length} 条连线
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => {
                            if (confirm(`导入「${t.name}」将覆盖当前画布，确定？`)) {
                              onImport(t.graph);
                            }
                          }}
                          className="flex-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
                        >
                          一键导入
                        </button>
                        <button
                          onClick={() => remove(t.id)}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/15"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

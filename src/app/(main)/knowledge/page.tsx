"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface NoteMeta {
  slug: string;
  title: string;
  tags: string[];
  linkCount: number;
  backlinkCount: number;
}

interface GraphData {
  nodes: { slug: string; title: string }[];
  edges: { source: string; target: string }[];
}

export default function KnowledgePage() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"edit" | "graph">("edit");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [uploading, setUploading] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "上传失败");
        return;
      }
      await refresh();
      openNote(data.slug);
    } finally {
      setUploading(false);
    }
  };

  const refresh = useCallback(async () => {
    const res = await fetch("/api/knowledge");
    if (res.status === 401) {
      setNeedLogin(true);
      return;
    }
    const data = await res.json();
    setNotes(data.notes ?? []);
    setGraph(data.graph ?? { nodes: [], edges: [] });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openNote = useCallback(async (slug: string) => {
    const res = await fetch(`/api/knowledge/${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveSlug(slug);
    setContent(data.content);
    setBacklinks(data.backlinks ?? []);
    setView("edit");
    setSavedAt(null);
  }, []);

  const save = async () => {
    if (!activeSlug) return;
    await fetch(`/api/knowledge/${encodeURIComponent(activeSlug)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSavedAt(new Date().toLocaleTimeString());
    refresh();
  };

  const remove = async () => {
    if (!activeSlug || !confirm(`删除笔记「${activeSlug}」？`)) return;
    await fetch(`/api/knowledge/${encodeURIComponent(activeSlug)}`, { method: "DELETE" });
    setActiveSlug(null);
    setContent("");
    refresh();
  };

  const create = async () => {
    const slug = newSlug.trim();
    if (!slug) return;
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "创建失败");
      return;
    }
    setNewSlug("");
    await refresh();
    openNote(slug);
  };

  const deleteTag = async (tag: string) => {
    const count = notes.filter((n) => n.tags.includes(tag)).length;
    if (
      !confirm(
        `确定删除标签「#${tag}」及其下的 ${count} 篇笔记？\n（带其他标签的笔记也会被一并删除，不可恢复）`
      )
    )
      return;
    await fetch(`/api/knowledge/tags/${encodeURIComponent(tag)}?mode=notes`, {
      method: "DELETE",
    });
    setActiveSlug(null);
    setContent("");
    refresh();
  };

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (slug: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 篇笔记？不可恢复。`)) return;
    for (const slug of selected) {
      await fetch(`/api/knowledge/${encodeURIComponent(slug)}`, { method: "DELETE" });
    }
    if (activeSlug && selected.has(activeSlug)) {
      setActiveSlug(null);
      setContent("");
    }
    setSelected(new Set());
    setSelectMode(false);
    refresh();
  };

  // 拖拽框选：按住下拉连续选中
  const dragging = useRef(false);
  const dragAdd = (slug: string) =>
    setSelected((s) => {
      if (s.has(slug)) return s;
      const next = new Set(s);
      next.add(slug);
      return next;
    });
  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);

  const visible = notes.filter(
    (n) =>
      !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.slug.toLowerCase().includes(search.toLowerCase())
  );

  /** 标签层级：B 的笔记全是 A 的笔记时 B 为 A 的子标签（等集时名更长的为子） */
  const hierarchy = useMemo(() => {
    const tagSets = new Map<string, NoteMeta[]>();
    for (const n of notes) {
      if (n.tags.length === 0) {
        tagSets.set("未分类", [...(tagSets.get("未分类") ?? []), n]);
      } else {
        for (const t of n.tags) {
          tagSets.set(t, [...(tagSets.get(t) ?? []), n]);
        }
      }
    }

    const parent = new Map<string, string | null>();
    for (const [t, tNotes] of tagSets) {
      if (t === "未分类") {
        parent.set(t, null);
        continue;
      }
      let best: string | null = null;
      for (const [u, uNotes] of tagSets) {
        if (u === t || u === "未分类" || uNotes.length < tNotes.length) continue;
        if (!tNotes.every((n) => uNotes.includes(n))) continue;
        // 集合相同（笔记完全一样）时，名字更短/更概括的作父标签
        if (uNotes.length === tNotes.length && u.length >= t.length) continue;
        if (
          !best ||
          uNotes.length < tagSets.get(best)!.length ||
          (uNotes.length === tagSets.get(best)!.length && u.length < best.length)
        ) {
          best = u;
        }
      }
      parent.set(t, best);
    }

    const children = new Map<string | null, string[]>();
    for (const [t, p] of parent) {
      children.set(p, [...(children.get(p) ?? []), t]);
    }
    for (const list of children.values()) {
      list.sort((a, b) => (a === "未分类" ? 1 : b === "未分类" ? -1 : a.localeCompare(b, "zh")));
    }

    // 每个标签的直属笔记 = 不属于其任何子标签的笔记
    const direct = new Map<string, NoteMeta[]>();
    for (const [t, tNotes] of tagSets) {
      const childNotes = new Set(
        (children.get(t) ?? []).flatMap((c) => tagSets.get(c) ?? [])
      );
      direct.set(t, tNotes.filter((n) => !childNotes.has(n)));
    }

    return { roots: children.get(null) ?? [], children, direct };
  }, [notes]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isCollapsed = (tag: string) => collapsed[tag] ?? true;
  const toggleGroup = (tag: string) =>
    setCollapsed((c) => ({ ...c, [tag]: !isCollapsed(tag) }));

  const graphNodes: Node[] = useMemo(() => {
    const cx = 350;
    const cy = 260;
    const r = Math.min(220, 60 + graph.nodes.length * 20);
    return graph.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(graph.nodes.length, 1);
      return {
        id: n.slug,
        position: { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) },
        data: { label: n.title },
        style: {
          background: activeSlug === n.slug ? "var(--accent)" : "var(--card)",
          color: activeSlug === n.slug ? "#fff" : "var(--fg)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          width: "auto",
        },
      };
    });
  }, [graph.nodes, activeSlug]);

  const graphEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.source,
        target: e.target,
        style: { stroke: "var(--muted)" },
      })),
    [graph.edges]
  );

  if (needLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">知识库为个人数据，请先登录</p>
        <a
          href="/login"
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
        >
          去登录
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 笔记列表 */}
      <div className="flex w-60 shrink-0 flex-col border-r border-line bg-card">
        <div className="space-y-2 border-b border-line p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索笔记…"
            className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <div className="flex gap-1">
            <input
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="新笔记名称"
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <button
              onClick={create}
              className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              新建
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50"
              title="上传 .md/.txt/docx/doc/xmind/drawio/xls，自动转为 Markdown"
            >
              {uploading ? "上传中…" : "上传"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.docx,.doc,.xmind,.drawio,.xls"
              className="hidden"
              onChange={upload}
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
              className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                selectMode
                  ? "bg-accent font-medium text-white shadow-sm"
                  : "border border-line text-muted hover:bg-subtle hover:text-fg"
              }`}
            >
              {selectMode ? "退出多选" : "多选"}
            </button>
            {selectMode && (
              <span className="text-xs text-muted">已选 {selected.size} 篇</span>
            )}
          </div>
        </div>
        <div
          className={`flex-1 space-y-0.5 overflow-y-auto p-2 ${selectMode ? "select-none" : ""}`}
          onMouseDown={(e) => {
            if (!selectMode) return;
            const el = (e.target as HTMLElement).closest("[data-slug]");
            if (!el) return;
            dragging.current = true;
            dragAdd(el.getAttribute("data-slug")!);
          }}
          onMouseMove={(e) => {
            if (!selectMode || !dragging.current) return;
            const el = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest("[data-slug]");
            if (el) dragAdd(el.getAttribute("data-slug")!);
          }}
        >
          {search ? (
            <>
              {visible.map((n) => (
                <NoteButton
                  key={n.slug}
                  note={n}
                  activeSlug={activeSlug}
                  onOpen={openNote}
                  selectable={selectMode}
                  checked={selected.has(n.slug)}
                  onToggle={toggleSelect}
                />
              ))}
              {visible.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted">没有匹配的笔记</p>
              )}
            </>
          ) : (
            hierarchy.roots.map((tag) => (
              <TagGroup
                key={tag}
                tag={tag}
                depth={0}
                childrenMap={hierarchy.children}
                directMap={hierarchy.direct}
                isCollapsed={isCollapsed}
                toggleGroup={toggleGroup}
                activeSlug={activeSlug}
                onOpen={openNote}
                onDeleteTag={deleteTag}
                selectable={selectMode}
                selected={selected}
                onToggle={toggleSelect}
              />
            ))
          )}
          {!search && hierarchy.roots.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted">暂无笔记</p>
          )}
        </div>
        {selectMode && selected.size > 0 && (
          <div className="flex gap-2 border-t border-line p-2">
            <button
              onClick={deleteSelected}
              className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-500"
            >
              删除选中（{selected.size}）
            </button>
            <button
              onClick={() => {
                setSelected(new Set());
                setSelectMode(false);
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 编辑区 / 图谱 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line bg-card px-4 py-2">
          <span className="text-sm text-muted">
            {activeSlug ? activeSlug : "未选择笔记"}
            {savedAt && <span className="ml-2 text-xs text-muted">已保存 {savedAt}</span>}
          </span>
          <div className="flex items-center gap-2">
            {activeSlug && view === "edit" && (
              <>
                <button
                  onClick={save}
                  className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  保存
                </button>
                <button
                  onClick={remove}
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/15"
                >
                  删除
                </button>
              </>
            )}
            <div className="flex rounded-lg border border-line text-sm">
              <button
                onClick={() => setView("edit")}
                className={`rounded-l-lg px-3 py-1 transition-colors ${view === "edit" ? "bg-accent font-medium text-white" : "text-muted hover:text-fg"}`}
              >
                编辑
              </button>
              <button
                onClick={() => setView("graph")}
                className={`rounded-r-lg px-3 py-1 transition-colors ${view === "graph" ? "bg-accent font-medium text-white" : "text-muted hover:text-fg"}`}
              >
                图谱
              </button>
            </div>
          </div>
        </div>

        {view === "graph" ? (
          <div className="min-h-0 flex-1">
            <ReactFlowProvider>
              <ReactFlow
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={(_, node) => openNote(node.id)}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--line)" />
                <Controls position="bottom-left" />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        ) : activeSlug ? (
          <div className="flex min-h-0 flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="用 Markdown 编写笔记，[[双方括号]] 创建双链，#标签 分类…"
              className="min-w-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 text-fg outline-none placeholder:text-muted"
            />
            <div className="w-52 shrink-0 overflow-y-auto border-l border-line bg-card p-3">
              <div className="text-xs font-medium text-muted">反向链接（{backlinks.length}）</div>
              <div className="mt-2 space-y-1">
                {backlinks.length === 0 ? (
                  <p className="text-xs text-muted">暂无其他笔记链接到这里</p>
                ) : (
                  backlinks.map((b) => (
                    <button
                      key={b}
                      onClick={() => openNote(b)}
                      className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-accent transition-colors hover:bg-subtle"
                    >
                      ← {b}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            从左侧选择一篇笔记，或新建一篇
          </div>
        )}
      </div>
    </div>
  );
}

function NoteButton({
  note,
  activeSlug,
  onOpen,
  selectable,
  checked,
  onToggle,
}: {
  note: NoteMeta;
  activeSlug: string | null;
  onOpen: (slug: string) => void;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: (slug: string) => void;
}) {
  return (
    <div
      data-slug={note.slug}
      className={`flex w-full items-center rounded-lg text-left text-sm transition-colors ${
        activeSlug === note.slug && !selectable
          ? "bg-accent-soft text-accent"
          : "text-fg hover:bg-subtle"
      } ${checked ? "bg-accent-soft" : ""}`}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={checked ?? false}
          onChange={() => onToggle?.(note.slug)}
          className="ml-2 shrink-0 accent-[var(--accent)]"
        />
      )}
      <button
        onClick={() => {
          if (!selectable) onOpen(note.slug);
        }}
        className="min-w-0 flex-1 px-3 py-2 text-left"
      >
        <div className="truncate">{note.title}</div>
        <div
          className={`mt-0.5 text-xs ${activeSlug === note.slug && !selectable ? "text-accent/70" : "text-muted"}`}
        >
          链接 {note.linkCount} · 反链 {note.backlinkCount}
        </div>
      </button>
    </div>
  );
}

function TagGroup({
  tag,
  depth,
  childrenMap,
  directMap,
  isCollapsed,
  toggleGroup,
  activeSlug,
  onOpen,
  onDeleteTag,
  selectable,
  selected,
  onToggle,
}: {
  tag: string;
  depth: number;
  childrenMap: Map<string | null, string[]>;
  directMap: Map<string, NoteMeta[]>;
  isCollapsed: (tag: string) => boolean;
  toggleGroup: (tag: string) => void;
  activeSlug: string | null;
  onOpen: (slug: string) => void;
  onDeleteTag: (tag: string) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (slug: string) => void;
}) {
  const subs = childrenMap.get(tag) ?? [];
  const direct = directMap.get(tag) ?? [];
  // 组内总笔记数（含所有子孙组，去重）
  const total = (() => {
    const set = new Set(direct);
    const walk = (t: string) => {
      for (const c of childrenMap.get(t) ?? []) {
        for (const n of directMap.get(c) ?? []) set.add(n);
        walk(c);
      }
    };
    walk(tag);
    return set.size;
  })();

  return (
    <div className="mb-1" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      <div className="group flex items-center">
        <button
          onClick={() => toggleGroup(tag)}
          className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
        >
          <span className="truncate">
            {isCollapsed(tag) ? "▸" : "▾"} #{tag}
          </span>
          <span className="text-muted">{total}</span>
        </button>
        {tag !== "未分类" && (
          <button
            onClick={() => onDeleteTag(tag)}
            className="hidden shrink-0 rounded px-1 text-xs text-muted transition-colors hover:text-red-500 group-hover:block"
            title={`删除标签 #${tag}`}
          >
            ✕
          </button>
        )}
      </div>
      {!isCollapsed(tag) && (
        <>
          {subs.map((c) => (
            <TagGroup
              key={c}
              tag={c}
              depth={depth + 1}
              childrenMap={childrenMap}
              directMap={directMap}
              isCollapsed={isCollapsed}
              toggleGroup={toggleGroup}
              activeSlug={activeSlug}
              onOpen={onOpen}
              onDeleteTag={onDeleteTag}
              selectable={selectable}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
          {direct.map((n) => (
            <NoteButton
              key={`${tag}-${n.slug}`}
              note={n}
              activeSlug={activeSlug}
              onOpen={onOpen}
              selectable={selectable}
              checked={selected?.has(n.slug)}
              onToggle={onToggle}
            />
          ))}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  group: string;
  createdAt: string;
}

const EMPTY_FORM = { name: "", description: "", content: "", group: "默认" };

export default function PromptsPage() {
  const [groups, setGroups] = useState<string[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [activeGroup, setActiveGroup] = useState("默认");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/prompts");
    const data = await res.json();
    setGroups(data.groups ?? []);
    setTemplates(data.templates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载时拉取数据（异步 setState）
    refresh();
  }, [refresh]);

  const submit = async () => {
    setError("");
    const url = editingId ? `/api/prompts/${editingId}` : "/api/prompts";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "保存失败");
      return;
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    refresh();
  };

  const startEdit = (t: PromptTemplate) => {
    setForm({ name: t.name, description: t.description, content: t.content, group: t.group });
    setEditingId(t.id);
    setShowForm(true);
    setError("");
  };

  const remove = async (id: string) => {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    refresh();
  };

  const addNewGroup = async () => {
    if (!newGroup.trim()) return;
    const res = await fetch("/api/prompts/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroup.trim() }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "添加失败");
      return;
    }
    setActiveGroup(newGroup.trim());
    setNewGroup("");
    refresh();
  };

  const removeGroup = async (name: string) => {
    if (!confirm(`删除分组「${name}」？组内模板会移入「默认」分组。`)) return;
    await fetch(`/api/prompts/groups/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (activeGroup === name) setActiveGroup("默认");
    refresh();
  };

  const visible = templates.filter((t) => t.group === activeGroup);

  return (
    <div className="flex h-full">
      {/* 分组侧栏 */}
      <div className="flex w-44 shrink-0 flex-col border-r border-line bg-card">
        <div className="border-b border-line px-4 py-3 text-xs font-medium text-muted">
          分组
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {groups.map((g) => (
            <div
              key={g}
              className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                activeGroup === g
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted hover:bg-subtle hover:text-fg"
              }`}
              onClick={() => setActiveGroup(g)}
            >
              <span className="truncate">{g}</span>
              <span className="ml-1 flex items-center gap-1">
                <span className={`text-xs ${activeGroup === g ? "text-accent" : "text-muted"}`}>
                  {templates.filter((t) => t.group === g).length}
                </span>
                {g !== "默认" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(g);
                    }}
                    className={`hidden text-xs transition-colors group-hover:block ${
                      activeGroup === g ? "text-accent hover:text-accent-hover" : "text-muted hover:text-red-500"
                    }`}
                    title="删除分组"
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-2">
          <div className="flex gap-1">
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNewGroup()}
              placeholder="新分组名"
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <button
              onClick={addNewGroup}
              className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-fg">提示词模板 · {activeGroup}</h1>
              <p className="mt-1 text-sm text-muted">
                在工作流的大模型节点中可一键导入模板后再编辑。
              </p>
            </div>
            <button
              onClick={() => {
                setForm({ ...EMPTY_FORM, group: activeGroup });
                setEditingId(null);
                setShowForm((v) => !v);
                setError("");
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {showForm ? "取消" : "+ 新增模板"}
            </button>
          </div>

          {showForm && (
            <div className="mt-4 space-y-3 rounded-xl border border-line bg-card p-4 shadow-sm">
              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className="mb-1 block text-xs font-medium text-muted">模板名称</span>
                  <input
                    value={form.name}
                    placeholder="如：会议纪要整理"
                    onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </label>
                <label className="block w-36">
                  <span className="mb-1 block text-xs font-medium text-muted">所属分组</span>
                  <select
                    value={form.group}
                    onChange={(e) => setForm((v) => ({ ...v, group: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                  >
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">描述</span>
                <input
                  value={form.description}
                  placeholder="一句话说明用途"
                  onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                  className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">模板内容</span>
                <textarea
                  rows={6}
                  value={form.content}
                  placeholder="支持 {{input}} / {{knowledge}} / {{节点名}} 变量"
                  onChange={(e) => setForm((v) => ({ ...v, content: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </label>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={submit}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {editingId ? "保存修改" : "创建模板"}
              </button>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted">加载中…</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-card py-14 shadow-sm">
                <div className="text-3xl">📝</div>
                <p className="mt-3 text-sm font-medium text-fg">
                  「{activeGroup}」分组还没有模板
                </p>
                <p className="mt-1 text-sm text-muted">点击右上角「新增模板」创建。</p>
              </div>
            ) : (
              visible.map((t) => (
                <div key={t.id} className="rounded-xl border border-line bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{t.name}</div>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                      )}
                      <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-subtle p-2 text-xs text-muted">
                        {t.content}
                      </pre>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-2 text-sm">
                      <button
                        onClick={() => startEdit(t)}
                        className="rounded-lg border border-line px-2.5 py-1 text-muted transition-colors hover:bg-subtle hover:text-fg"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => remove(t.id)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

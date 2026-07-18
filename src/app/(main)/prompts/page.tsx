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
      <div className="flex w-44 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3 text-xs font-medium text-neutral-500">
          分组
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {groups.map((g) => (
            <div
              key={g}
              className={`group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm ${
                activeGroup === g
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
              onClick={() => setActiveGroup(g)}
            >
              <span className="truncate">{g}</span>
              <span className="ml-1 flex items-center gap-1">
                <span className={`text-xs ${activeGroup === g ? "text-neutral-300" : "text-neutral-400"}`}>
                  {templates.filter((t) => t.group === g).length}
                </span>
                {g !== "默认" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(g);
                    }}
                    className={`hidden text-xs group-hover:block ${
                      activeGroup === g ? "text-neutral-300 hover:text-white" : "text-neutral-400 hover:text-rose-600"
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
        <div className="border-t border-neutral-100 p-2">
          <div className="flex gap-1">
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNewGroup()}
              placeholder="新分组名"
              className="min-w-0 flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-blue-400"
            />
            <button
              onClick={addNewGroup}
              className="shrink-0 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
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
              <h1 className="text-xl font-semibold">提示词模板 · {activeGroup}</h1>
              <p className="mt-1 text-sm text-neutral-500">
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
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
            >
              {showForm ? "取消" : "+ 新增模板"}
            </button>
          </div>

          {showForm && (
            <div className="mt-4 space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-500">模板名称</span>
                  <input
                    value={form.name}
                    placeholder="如：会议纪要整理"
                    onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                    className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                  />
                </label>
                <label className="block w-36">
                  <span className="mb-1 block text-xs font-medium text-neutral-500">所属分组</span>
                  <select
                    value={form.group}
                    onChange={(e) => setForm((v) => ({ ...v, group: e.target.value }))}
                    className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
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
                <span className="mb-1 block text-xs font-medium text-neutral-500">描述</span>
                <input
                  value={form.description}
                  placeholder="一句话说明用途"
                  onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                  className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">模板内容</span>
                <textarea
                  rows={6}
                  value={form.content}
                  placeholder="支持 {{input}} / {{knowledge}} / {{节点名}} 变量"
                  onChange={(e) => setForm((v) => ({ ...v, content: e.target.value }))}
                  className="w-full resize-y rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              </label>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button
                onClick={submit}
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700"
              >
                {editingId ? "保存修改" : "创建模板"}
              </button>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-neutral-400">加载中…</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-neutral-300 bg-white py-14">
                <div className="text-3xl">📝</div>
                <p className="mt-3 text-sm font-medium text-neutral-700">
                  「{activeGroup}」分组还没有模板
                </p>
                <p className="mt-1 text-sm text-neutral-400">点击右上角「新增模板」创建。</p>
              </div>
            ) : (
              visible.map((t) => (
                <div key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{t.name}</div>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-neutral-400">{t.description}</p>
                      )}
                      <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-neutral-50 p-2 text-xs text-neutral-600">
                        {t.content}
                      </pre>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-2 text-sm">
                      <button
                        onClick={() => startEdit(t)}
                        className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 hover:bg-neutral-100"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => remove(t.id)}
                        className="rounded-md border border-rose-200 px-2.5 py-1 text-rose-600 hover:bg-rose-50"
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

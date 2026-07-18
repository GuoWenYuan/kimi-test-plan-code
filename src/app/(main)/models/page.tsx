"use client";

import { useCallback, useEffect, useState } from "react";

interface ModelPreset {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

const EMPTY_FORM = { name: "", model: "", baseUrl: "", apiKey: "" };

function maskKey(key: string) {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export default function ModelsPage() {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/models");
    if (res.status === 401) {
      setNeedLogin(true);
      setLoading(false);
      return;
    }
    setPresets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async () => {
    setError("");
    const url = editingId ? `/api/models/${editingId}` : "/api/models";
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

  const startEdit = (p: ModelPreset) => {
    setForm({ name: p.name, model: p.model, baseUrl: p.baseUrl, apiKey: p.apiKey });
    setEditingId(p.id);
    setShowForm(true);
    setError("");
  };

  const remove = async (id: string) => {
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    refresh();
  };

  const test = async (id: string) => {
    setTestingId(id);
    setTestResult((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/models/${id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult((m) => ({
        ...m,
        [id]: data.ok ? `✅ ${data.reply}` : `❌ ${data.error}`,
      }));
    } catch (e) {
      setTestResult((m) => ({ ...m, [id]: `❌ ${e instanceof Error ? e.message : e}` }));
    } finally {
      setTestingId(null);
    }
  };

  if (needLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-neutral-500">模型预设为个人数据，请先登录</p>
        <a
          href="/login"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700"
        >
          去登录
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">模型预设</h1>
          <p className="mt-1 text-sm text-neutral-500">
            预设大模型的 ApiKey 与 BaseUrl 并命名包装，工作流节点可直接选用。
          </p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditingId(null);
            setShowForm((v) => !v);
            setError("");
          }}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
        >
          {showForm ? "取消" : "+ 新增预设"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
          {(
            [
              { key: "name", label: "包装名称", placeholder: "如：Kimi 生产环境" },
              { key: "model", label: "模型名", placeholder: "如：kimi-k2 / gpt-4o" },
              { key: "baseUrl", label: "BaseUrl", placeholder: "如：https://api.moonshot.cn/v1" },
              { key: "apiKey", label: "ApiKey", placeholder: "sk-..." },
            ] as const
          ).map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">{f.label}</span>
              <input
                value={form[f.key]}
                placeholder={f.placeholder}
                type={f.key === "apiKey" ? "password" : "text"}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            </label>
          ))}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            onClick={submit}
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            {editingId ? "保存修改" : "创建预设"}
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-400">加载中…</p>
        ) : presets.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-neutral-300 bg-white py-14">
            <div className="text-3xl">🤖</div>
            <p className="mt-3 text-sm font-medium text-neutral-700">还没有模型预设</p>
            <p className="mt-1 text-sm text-neutral-400">点击右上角「新增预设」添加第一个模型。</p>
          </div>
        ) : (
          presets.map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">{p.name}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                      {p.model}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {p.baseUrl} · Key: {maskKey(p.apiKey)}
                  </p>
                  {testResult[p.id] && (
                    <p className="mt-2 text-xs text-neutral-600">{testResult[p.id]}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2 text-sm">
                  <button
                    onClick={() => test(p.id)}
                    disabled={testingId === p.id}
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    {testingId === p.id ? "测试中…" : "测试连接"}
                  </button>
                  <button
                    onClick={() => startEdit(p)}
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 hover:bg-neutral-100"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => remove(p.id)}
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
  );
}

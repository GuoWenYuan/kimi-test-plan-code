"use client";

import { useCallback, useEffect, useState } from "react";

interface KeyItem {
  id: string;
  userId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
}

interface AdminKeyItem {
  id: string;
  name: string;
  baseUrl: string;
  owner: string;
  createdAt: string;
}

const inputCls =
  "rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function KeysManager({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [allKeys, setAllKeys] = useState<AdminKeyItem[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/keys");
    if (res.ok) {
      setKeys(await res.json());
      setError("");
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "加载 Key 列表失败");
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!isSuperAdmin) return;
    const res = await fetch("/api/keys?all=true");
    if (res.ok) {
      setAllKeys(await res.json());
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载时拉取数据（异步 setState）
    load();
    loadAll();
  }, [load, loadAll]);

  async function handleError(res: Response) {
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "操作失败");
    setMessage("");
  }

  function notify(msg: string) {
    setMessage(msg);
    setError("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, baseUrl, apiKey }),
    });
    if (!res.ok) return handleError(res);
    setName("");
    setBaseUrl("");
    setApiKey("");
    notify("Key 创建成功");
    load();
    loadAll();
  }

  function startEdit(k: KeyItem) {
    setEditingId(k.id);
    setEditName(k.name);
    setEditBaseUrl(k.baseUrl);
    setEditApiKey(k.apiKey);
  }

  async function handleSave(id: string) {
    const res = await fetch(`/api/keys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, baseUrl: editBaseUrl, apiKey: editApiKey }),
    });
    if (!res.ok) return handleError(res);
    setEditingId(null);
    notify("保存成功");
    load();
    loadAll();
  }

  async function handleDelete(k: KeyItem) {
    if (!window.confirm(`确定删除 Key「${k.name}」吗？`)) return;
    const res = await fetch(`/api/keys/${k.id}`, { method: "DELETE" });
    if (!res.ok) return handleError(res);
    notify("删除成功");
    load();
    loadAll();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900">API Key 管理</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-gray-500">名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            required
            placeholder="https://api.example.com/v1"
            className={`${inputCls} w-72`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">API Key</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required className={`${inputCls} w-64`} />
        </div>
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          新建 Key
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">我的 Key</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">Base URL</th>
                <th className="px-4 py-3">API Key</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-gray-100 last:border-0">
                  {editingId === k.id ? (
                    <>
                      <td className="px-4 py-3">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} />
                      </td>
                      <td className="px-4 py-3">
                        <input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} className={`${inputCls} w-64`} />
                      </td>
                      <td className="px-4 py-3">
                        <input value={editApiKey} onChange={(e) => setEditApiKey(e.target.value)} className={`${inputCls} w-56`} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-gray-900">{k.name}</td>
                      <td className="px-4 py-3 text-gray-700">{k.baseUrl}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{k.apiKey}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-gray-500">{new Date(k.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="space-x-2 px-4 py-3">
                    {editingId === k.id ? (
                      <>
                        <button onClick={() => handleSave(k.id)} className="text-sm text-blue-600 hover:underline">
                          保存
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 hover:underline">
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(k)} className="text-sm text-blue-600 hover:underline">
                          编辑
                        </button>
                        <button onClick={() => handleDelete(k)} className="text-sm text-red-600 hover:underline">
                          删除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    暂无 Key，请在上方创建
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isSuperAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">所有用户的 Key（仅名称与 Base URL）</h2>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">所属用户</th>
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">Base URL</th>
                  <th className="px-4 py-3">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {allKeys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{k.owner}</td>
                    <td className="px-4 py-3 text-gray-700">{k.name}</td>
                    <td className="px-4 py-3 text-gray-700">{k.baseUrl}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(k.createdAt).toLocaleString("zh-CN")}</td>
                  </tr>
                ))}
                {allKeys.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

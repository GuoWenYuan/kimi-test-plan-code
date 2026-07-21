"use client";

import { useCallback, useEffect, useState } from "react";

interface UserItem {
  id: string;
  username: string;
  password: string;
  role: "super_admin" | "user";
  createdAt: string;
}

const inputCls =
  "rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25";

export default function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"super_admin" | "user">("user");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"super_admin" | "user">("user");

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
      setError("");
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "加载用户列表失败");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首次挂载时拉取数据（异步 setState）
    load();
  }, [load]);

  function notify(msg: string) {
    setMessage(msg);
    setError("");
  }

  async function handleError(res: Response) {
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "操作失败");
    setMessage("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    });
    if (!res.ok) return handleError(res);
    setNewUsername("");
    setNewPassword("");
    setNewRole("user");
    notify("用户创建成功");
    load();
  }

  function startEdit(user: UserItem) {
    setEditingId(user.id);
    setEditPassword(user.password);
    setEditRole(user.role);
  }

  async function handleSave(id: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: editPassword, role: editRole }),
    });
    if (!res.ok) return handleError(res);
    setEditingId(null);
    notify("保存成功");
    load();
  }

  async function handleDelete(user: UserItem) {
    if (!window.confirm(`确定删除用户「${user.username}」吗？`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) return handleError(res);
    notify("删除成功");
    load();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-fg">用户管理</h1>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-muted">用户名</label>
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">密码</label>
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">角色</label>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as "super_admin" | "user")} className={inputCls}>
            <option value="user">普通用户</option>
            <option value="super_admin">超级管理员</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50">
          创建用户
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-line bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">用户名</th>
              <th className="px-4 py-3">密码（明文）</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">创建时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-fg">
                  {u.username}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-muted">（当前用户）</span>}
                </td>
                {editingId === u.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className={inputCls} />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as "super_admin" | "user")}
                        className={inputCls}
                      >
                        <option value="user">普通用户</option>
                        <option value="super_admin">超级管理员</option>
                      </select>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-mono text-fg">{u.password}</td>
                    <td className="px-4 py-3 text-fg">{u.role === "super_admin" ? "超级管理员" : "普通用户"}</td>
                  </>
                )}
                <td className="px-4 py-3 text-muted">{new Date(u.createdAt).toLocaleString("zh-CN")}</td>
                <td className="space-x-2 px-4 py-3">
                  {editingId === u.id ? (
                    <>
                      <button onClick={() => handleSave(u.id)} className="text-sm text-accent transition-colors hover:underline">
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-sm text-muted transition-colors hover:text-fg hover:underline">
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(u)} className="text-sm text-accent transition-colors hover:underline">
                        编辑
                      </button>
                      {u.id !== currentUserId && (
                        <button onClick={() => handleDelete(u)} className="text-sm text-red-500 transition-colors hover:underline">
                          删除
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

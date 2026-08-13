"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "注册失败，请稍后重试");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      {/* 晨雾背景 */}
      <div className="bg-stage" aria-hidden="true">
        <span className="bg-blob blob-mint" />
        <span className="bg-blob blob-teal" />
        <span className="bg-blob blob-aqua" />
      </div>
      <div className="anim-card glass-card relative z-10 w-full max-w-sm rounded-3xl p-6 shadow-lift md:p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="anim-pop bg-grad-accent anim-grad flex h-12 w-12 items-center justify-center rounded-2xl font-display text-xl font-bold text-white shadow-lift">
            站
          </span>
          <h1 className="font-display text-2xl font-bold tracking-wide text-fg">注册账号</h1>
          <p className="text-xs tracking-widest text-muted">PERSONAL WORKBENCH</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-fg">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-fg">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-fg">
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="input w-full"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full !py-2.5"
          >
            {loading ? "注册中…" : "注 册"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          已有账号？{" "}
          <Link href="/login" className="text-accent hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}

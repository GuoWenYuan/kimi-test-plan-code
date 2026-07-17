"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Topbar() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUsername(d.user?.username ?? null))
      .catch(() => {});
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUsername(null);
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-6">
      <div className="flex-1">
        <input
          type="search"
          placeholder="全局搜索（待接入）…"
          disabled
          className="w-full max-w-md rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 placeholder:text-neutral-400"
        />
      </div>
      <div className="flex items-center gap-3">
        {username ? (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-sm text-white">
              {username.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm text-neutral-700">{username}</span>
            <button
              onClick={logout}
              className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
            >
              退出
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            登录
          </Link>
        )}
      </div>
    </header>
  );
}

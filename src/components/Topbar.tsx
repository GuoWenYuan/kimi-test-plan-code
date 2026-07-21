"use client";

import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

interface TopbarProps {
  username: string;
  role: string;
}

export default function Topbar({ username, role }: TopbarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-card px-6">
      <div className="text-sm text-muted">欢迎使用个人工作站</div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <span className="flex items-center gap-2 text-sm text-fg">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
            {username.slice(0, 1).toUpperCase()}
          </span>
          {username}
          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
            {role === "super_admin" ? "超级管理员" : "普通用户"}
          </span>
        </span>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg"
        >
          退出登录
        </button>
      </div>
    </header>
  );
}

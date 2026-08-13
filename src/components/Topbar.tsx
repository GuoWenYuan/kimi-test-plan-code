"use client";

import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import ViewToggle from "@/components/ViewToggle";

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
    // 悬浮玻璃顶条：与 Sidebar 同一展签语言
    <header className="glass-card mx-3 mt-3 flex h-14 shrink-0 items-center justify-between rounded-2xl px-4 md:px-5">
      <div className="hidden font-display text-sm font-medium tracking-wide text-muted sm:block">
        个人<span className="text-grad font-bold">工作站</span>
      </div>
      {/* 小屏下侧边栏隐藏，顶栏补一个简化站名 */}
      <div className="font-display text-sm font-bold text-fg sm:hidden">个人工作站</div>
      <div className="flex items-center gap-3">
        <ViewToggle />
        <ThemeToggle />
        <span className="flex items-center gap-2 text-sm text-fg">
          <span className="bg-grad-accent flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white shadow-lift ring-2 ring-accent/30 transition-all duration-200 hover:scale-110 hover:ring-accent/60">
            {username.slice(0, 1).toUpperCase()}
          </span>
          {username}
          <span className="chip hidden sm:inline-flex">
            {role === "super_admin" ? "超级管理员" : "普通用户"}
          </span>
        </span>
        <button
          onClick={handleLogout}
          className="btn-ghost !py-1.5 text-muted hover:text-fg"
        >
          退出登录
        </button>
      </div>
    </header>
  );
}

"use client";

import { useRouter } from "next/navigation";

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
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="text-sm text-gray-500">欢迎使用后台管理系统</div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">
          {username}
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {role === "super_admin" ? "超级管理员" : "普通用户"}
          </span>
        </span>
        <button
          onClick={handleLogout}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          退出登录
        </button>
      </div>
    </header>
  );
}

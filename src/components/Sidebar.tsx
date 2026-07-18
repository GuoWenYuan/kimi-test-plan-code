"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  role: string;
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

  const menus = [
    { href: "/", label: "仪表盘" },
    // 用户管理仅 super_admin 可见（服务端接口同样做了权限校验）
    ...(role === "super_admin" ? [{ href: "/users", label: "用户管理" }] : []),
    { href: "/keys", label: "API Key 管理" },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-gray-900 text-gray-200">
      <div className="px-5 py-5 text-lg font-bold text-white">后台管理系统</div>
      <nav className="flex-1 space-y-1 px-3">
        {menus.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                active ? "bg-gray-700 font-medium text-white" : "hover:bg-gray-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

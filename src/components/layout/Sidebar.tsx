"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "工作台", icon: "🏠" },
  { href: "/workflows", label: "工作流", icon: "🔁" },
  { href: "/knowledge", label: "知识库", icon: "📚" },
  { href: "/models", label: "模型", icon: "🤖" },
  { href: "/prompts", label: "提示词", icon: "📝" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-neutral-200 px-4">
        <span className="text-lg">🛠️</span>
        <span className="text-sm font-semibold text-neutral-900">
          个人工作台
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-400">
          <span>⚙️</span>
          <span>设置（待添加）</span>
        </div>
      </div>
    </aside>
  );
}

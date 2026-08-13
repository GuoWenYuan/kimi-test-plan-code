"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS, buildNavItems } from "@/components/nav-items";

interface SidebarProps {
  role: string;
  username: string;
}

export default function Sidebar({ role, username }: SidebarProps) {
  const pathname = usePathname();
  const menus = buildNavItems(role, username);

  return (
    // 小屏隐藏侧边栏，导航由 MobileNav 底部标签栏承担
    // 悬浮玻璃展签：my-3 ml-3 浮于晨雾背景之上，glass-card 自带描边与内高光
    <aside className="glass-card my-3 ml-3 hidden w-56 shrink-0 flex-col rounded-2xl md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="logo-badge bg-grad-accent anim-grad flex h-8 w-8 cursor-default items-center justify-center rounded-lg font-display text-sm font-bold text-white shadow-lift">
          站
        </span>
        <span className="font-display text-base font-bold tracking-wide text-fg">个人工作站</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        {menus.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 hover:translate-x-0.5 ${
                active
                  ? "bg-grad-accent font-semibold text-white shadow-lift"
                  : "text-muted hover:bg-subtle hover:text-fg"
              }`}
            >
              <span className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110">{NAV_ICONS[item.label]}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

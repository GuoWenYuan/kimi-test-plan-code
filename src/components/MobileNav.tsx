"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS, buildNavItems } from "@/components/nav-items";

interface MobileNavProps {
  role: string;
  username: string;
}

// 移动端底部标签栏（md 以下显示）：前 4 项常驻 + 「更多」弹出全部菜单
export default function MobileNav({ role, username }: MobileNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const menus = buildNavItems(role, username);
  const pinned = menus.slice(0, 4);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  // 「更多」里某一项被选中时，更多按钮也高亮
  const moreActive = menus.slice(4).some((item) => isActive(item.href));

  return (
    <>
      {/* 悬浮玻璃坞：浮于晨雾背景之上，选中 = 渐变 pill + 投影 */}
      <nav className="glass-card fixed inset-x-3 bottom-3 z-40 rounded-2xl pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex h-14 items-stretch">
          {pinned.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "font-semibold text-fg" : "text-muted"
                }`}
              >
                {/* 选中项图标加极光渐变 pill，弹出动画 */}
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 [&>svg]:h-5 [&>svg]:w-5 ${
                    active ? "anim-pop bg-grad-accent text-white shadow-lift" : ""
                  }`}
                >
                  {NAV_ICONS[item.label]}
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
              moreActive ? "font-semibold text-accent" : "text-muted"
            }`}
          >
            <span className="h-5 w-5">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
              </svg>
            </span>
            更多
          </button>
        </div>
      </nav>

      {sheetOpen && (
        // 底部抽屉：遮罩点击关闭，含全部菜单项（含角色相关项）
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="glass-card mx-3 mb-3 rounded-2xl px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
            <nav className="grid grid-cols-4 gap-1">
              {menus.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] ${
                      active ? "bg-grad-accent font-semibold text-white shadow-lift" : "text-muted hover:bg-subtle hover:text-fg"
                    }`}
                  >
                    <span className="h-5 w-5">{NAV_ICONS[item.label]}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  role: string;
  username: string;
}

const ICONS: Record<string, React.ReactNode> = {
  仪表盘: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  工作流: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6a3 3 0 0 1 3 3v6" /><path d="M15 18H9a3 3 0 0 1-3-3V9" />
    </svg>
  ),
  知识库: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  模型: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </svg>
  ),
  提示词: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  "Unity 控制": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" /><path d="M12 22V12" /><path d="m3 7 9 5 9-5" />
    </svg>
  ),
  "AI 工具": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
    </svg>
  ),
  "Server-PIAgent": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  用户管理: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

export default function Sidebar({ role, username }: SidebarProps) {
  const pathname = usePathname();

  const menus = [
    { href: "/", label: "仪表盘" },
    { href: "/workflows", label: "工作流" },
    { href: "/knowledge", label: "知识库" },
    { href: "/models", label: "模型" },
    { href: "/prompts", label: "提示词" },
    { href: "/unity", label: "Unity 控制" },
    { href: "/tools", label: "AI 工具" },
    // Server-PIAgent 在服务器上执行本机命令，仅 guowenyuan 可见（页面与接口另有强校验）
    ...(role === "super_admin" && username === "guowenyuan"
      ? [{ href: "/pi", label: "Server-PIAgent" }]
      : []),
    // 用户管理仅 super_admin 可见（服务端接口同样做了权限校验）
    ...(role === "super_admin" ? [{ href: "/users", label: "用户管理" }] : []),
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-card">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="logo-badge flex h-8 w-8 cursor-default items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-sm">
          站
        </span>
        <span className="text-base font-bold tracking-wide text-fg">个人工作站</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        {menus.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:translate-x-0.5 ${
                active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted hover:bg-subtle hover:text-fg"
              }`}
            >
              {/* 选中项左侧指示条，展开动画 */}
              <span
                className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent transition-transform duration-200 ${
                  active ? "scale-y-100" : "scale-y-0"
                }`}
              />
              <span className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110">{ICONS[item.label]}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

// 侧边栏与移动端底部标签栏共享的菜单配置
export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ICONS: Record<string, React.ReactNode> = {
  首页: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  知识库: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  宠物: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14" r="5" /><circle cx="7" cy="7.5" r="1.8" /><circle cx="17" cy="7.5" r="1.8" />
      <circle cx="12" cy="5.5" r="1.8" />
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
  快捷指令: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 17 6-6-6-6" /><path d="M12 19h8" />
    </svg>
  ),
  "Unity 控制": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" /><path d="M12 22V12" /><path d="m3 7 9 5 9-5" />
    </svg>
  ),
  "AI 工具": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3-1.3L12 21l-1.9-5.8a2 2 0 0 0 1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
    </svg>
  ),
  用户管理: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

// 菜单项可见性规则与 Sidebar 保持一致（页面与接口另有服务端强校验）
export function buildNavItems(role: string, username: string): NavItem[] {
  void username;
  return [
    { href: "/", label: "首页" },
    { href: "/knowledge", label: "知识库" },
    { href: "/pets", label: "宠物" },
    { href: "/models", label: "模型" },
    { href: "/prompts", label: "提示词" },
    { href: "/commands", label: "快捷指令" },
    { href: "/unity", label: "Unity 控制" },
    { href: "/tools", label: "AI 工具" },
    // 用户管理仅 super_admin 可见
    ...(role === "super_admin" ? [{ href: "/users", label: "用户管理" }] : []),
  ];
}

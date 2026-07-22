"use client";

import { useEffect, useState } from "react";

// 主题切换：light / dark，持久化到 localStorage，属性挂在 <html data-theme>
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时同步 <html> 上已生效的主题
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 忽略隐私模式下的写入失败
    }
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      aria-label="切换主题"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition-colors hover:bg-subtle hover:text-fg"
    >
      {theme === "dark" ? (
        // 太阳（key 触发切换时的弹出动画）
        <svg key="sun" className="anim-pop h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // 月亮
        <svg key="moon" className="anim-pop h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";

const MOBILE_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";
const DESKTOP_CONTENT = "width=1100";

function applyViewMode(mode: "auto" | "desktop") {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute("content", mode === "desktop" ? DESKTOP_CONTENT : MOBILE_CONTENT);
  }
}

// 手机/电脑版切换：电脑版 = 固定 1100px 布局宽度，桌面布局整体缩放渲染（可双指放大）
// 仅小屏显示（md:hidden）；选择持久化到 localStorage，首屏脚本见 src/app/layout.tsx
export default function ViewToggle() {
  const [mode, setMode] = useState<"auto" | "desktop">("auto");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("view-mode");
    } catch {
      // 忽略隐私模式下的读取失败
    }
    const current = stored === "desktop" ? "desktop" : "auto";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时同步 localStorage 中已生效的视口模式
    setMode(current);
    // 兜底：若首屏脚本执行时 viewport meta 尚未注入，这里再强制应用一次
    applyViewMode(current);
  }, []);

  function toggle() {
    const next = mode === "desktop" ? "auto" : "desktop";
    setMode(next);
    applyViewMode(next);
    try {
      localStorage.setItem("view-mode", next);
    } catch {
      // 忽略隐私模式下的写入失败
    }
  }

  return (
    <button
      onClick={toggle}
      title={mode === "desktop" ? "切换到手机版" : "切换到电脑版"}
      aria-label="切换手机/电脑版"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition-colors hover:bg-subtle hover:text-fg md:hidden"
    >
      {mode === "desktop" ? (
        // 手机（key 触发切换时的弹出动画）
        <svg key="phone" className="anim-pop h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M11 18h2" />
        </svg>
      ) : (
        // 显示器
        <svg key="monitor" className="anim-pop h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
    </button>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人工作站",
  description: "集工作流、知识库、模型、提示词于一体的个人工作站",
};

// 首屏前按 localStorage / 系统偏好设置 data-theme，避免主题闪烁
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

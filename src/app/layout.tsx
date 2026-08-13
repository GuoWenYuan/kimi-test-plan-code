import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// 自托管可变字体（public/fonts/，构建期离线可用）：
// Syne = 展示标题（前卫艺术感），Manrope = 正文，JetBrains Mono = 日志/代码
const syne = localFont({
  src: "../../public/fonts/Syne-Variable.woff2",
  variable: "--font-syne",
  weight: "400 800",
  display: "swap",
});
const manrope = localFont({
  src: "../../public/fonts/Manrope-Variable.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});
const jbMono = localFont({
  src: "../../public/fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-jbmono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "个人工作站",
  description: "集知识库、宠物、模型、提示词于一体的个人工作站",
};

// viewportFit: "cover" 铺满 iPhone 刘海/Home 指示条区域，配合 env(safe-area-inset-*) 使用
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// 首屏前按 localStorage 设置 data-theme，避免主题闪烁；无偏好时默认 light（青屿晨光基调）；
// 若用户手动切到「电脑版」，把 viewport 改为固定 1100px 布局宽度（桌面布局整体缩放渲染）
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t="light";}document.documentElement.setAttribute("data-theme",t);if(localStorage.getItem("view-mode")==="desktop"){var m=document.querySelector('meta[name="viewport"]');if(m){m.setAttribute("content","width=1100");}}}catch(e){}})();`;

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
      <body
        className={`${syne.variable} ${manrope.variable} ${jbMono.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

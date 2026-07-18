import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "后台管理系统",
  description: "用户与模型 API Key 管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

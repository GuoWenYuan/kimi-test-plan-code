import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/auth";
import { listUsers } from "@/lib/store";
import { listPresets } from "@/lib/models-store";

const ENTRIES = [
  { href: "/workflows", title: "工作流", description: "可视化编排与运行工作流" },
  { href: "/knowledge", title: "知识库", description: "个人知识笔记与图谱" },
  { href: "/models", title: "模型", description: "模型预设（BaseUrl / ApiKey）与用量查询" },
  { href: "/prompts", title: "提示词", description: "提示词模板管理" },
];

export default async function DashboardPage() {
  const user = await requireUserOrRedirect();
  const myPresetCount = (await listPresets(user.id)).length;
  const userCount = user.role === "super_admin" ? listUsers().length : null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-fg">仪表盘</h1>
      <p className="text-muted">
        你好，<span className="font-medium">{user.username}</span>，欢迎回来。
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="anim-card rounded-xl border border-line bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style={{ animationDelay: "0ms" }}>
          <div className="text-sm text-muted">我的模型预设</div>
          <div className="mt-2 text-3xl font-bold text-fg">{myPresetCount}</div>
        </div>
        {userCount !== null && (
          <div className="anim-card rounded-xl border border-line bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style={{ animationDelay: "60ms" }}>
            <div className="text-sm text-muted">用户总数</div>
            <div className="mt-2 text-3xl font-bold text-fg">{userCount}</div>
          </div>
        )}
        <div className="anim-card rounded-xl border border-line bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style={{ animationDelay: "120ms" }}>
          <div className="text-sm text-muted">当前角色</div>
          <div className="mt-2 text-3xl font-bold text-fg">
            {user.role === "super_admin" ? "超级管理员" : "普通用户"}
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-fg">功能入口</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRIES.map((entry, i) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="anim-card rounded-xl border border-line bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:bg-accent-soft hover:shadow-md"
            style={{ animationDelay: `${180 + i * 60}ms` }}
          >
            <div className="text-sm font-medium text-fg">{entry.title}</div>
            <p className="mt-1 text-sm text-muted">{entry.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

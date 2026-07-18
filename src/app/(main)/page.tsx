import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/auth";
import { listKeysByUser, listUsers } from "@/lib/store";

const ENTRIES = [
  { href: "/workflows", title: "工作流", description: "可视化编排与运行工作流" },
  { href: "/knowledge", title: "知识库", description: "个人知识笔记与图谱" },
  { href: "/models", title: "模型", description: "模型预设（BaseUrl / ApiKey）" },
  { href: "/prompts", title: "提示词", description: "提示词模板管理" },
  { href: "/keys", title: "API Key 管理", description: "管理自己的模型 API Key" },
];

export default async function DashboardPage() {
  const user = await requireUserOrRedirect();
  const myKeyCount = listKeysByUser(user.id).length;
  const userCount = user.role === "super_admin" ? listUsers().length : null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>
      <p className="text-gray-600">
        你好，<span className="font-medium">{user.username}</span>，欢迎回来。
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">我的 API Key</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{myKeyCount}</div>
        </div>
        {userCount !== null && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">用户总数</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{userCount}</div>
          </div>
        )}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">当前角色</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {user.role === "super_admin" ? "超级管理员" : "普通用户"}
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-900">功能入口</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow"
          >
            <div className="text-sm font-medium text-gray-900">{entry.title}</div>
            <p className="mt-1 text-sm text-gray-500">{entry.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

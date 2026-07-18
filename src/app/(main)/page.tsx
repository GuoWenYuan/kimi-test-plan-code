import { requireUserOrRedirect } from "@/lib/auth";
import { listKeysByUser, listUsers } from "@/lib/store";

export default async function DashboardPage() {
  const user = await requireUserOrRedirect();
  const myKeyCount = listKeysByUser(user.id).length;
  const userCount = user.role === "super_admin" ? listUsers().length : null;

  return (
    <div className="space-y-6">
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
    </div>
  );
}

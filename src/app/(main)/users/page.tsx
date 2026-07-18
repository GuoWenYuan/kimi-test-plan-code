import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth";
import UsersManager from "./UsersManager";

export default async function UsersPage() {
  const user = await requireUserOrRedirect();
  // 服务端权限校验：普通用户访问用户管理页直接跳回仪表盘
  if (user.role !== "super_admin") {
    redirect("/");
  }
  return <UsersManager currentUserId={user.id} />;
}

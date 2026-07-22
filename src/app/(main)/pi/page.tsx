import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth";
import PiPanel from "./PiPanel";

export default async function PiPage() {
  const user = await requireUserOrRedirect();
  // Pi agent 在服务器上执行本机命令，仅开放给超级管理员 guowenyuan
  if (user.role !== "super_admin" || user.username !== "guowenyuan") redirect("/");
  return <PiPanel />;
}

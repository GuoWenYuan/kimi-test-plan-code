import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // 已登录用户直接进后台（此处做的是有效的 session 强校验）
  const user = await getSessionUser();
  if (user) {
    redirect("/");
  }
  return <LoginForm />;
}

import { requireUserOrRedirect } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserOrRedirect();

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar username={user.username} role={user.role} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

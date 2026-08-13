import { requireUserOrRedirect } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import MobileNav from "@/components/MobileNav";
import PetOverlay from "@/components/pet/PetOverlay";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserOrRedirect();

  return (
    // h-screen + min-h-0：知识库等页面需要充满剩余高度且不出现整页滚动
    // bg-stage：青屿晨光背景层（晨雾光斑，fixed z-0），内容层 z-10
    <div className="flex h-screen overflow-hidden">
      <div className="bg-stage" aria-hidden="true">
        <span className="bg-blob blob-mint" />
        <span className="bg-blob blob-teal" />
        <span className="bg-blob blob-aqua" />
      </div>
      <div className="relative z-10 flex min-w-0 flex-1">
        <Sidebar role={user.role} username={user.username} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar username={user.username} role={user.role} />
          {/* pb-20：小屏给悬浮玻璃坞（MobileNav，bottom-3 + h-14）让位 */}
          <main className="min-h-0 flex-1 overflow-auto pb-20 md:pb-0">{children}</main>
        </div>
        <MobileNav role={user.role} username={user.username} />
        <PetOverlay />
      </div>
    </div>
  );
}

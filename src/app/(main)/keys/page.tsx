import { requireUserOrRedirect } from "@/lib/auth";
import KeysManager from "./KeysManager";

export default async function KeysPage() {
  const user = await requireUserOrRedirect();
  return <KeysManager isSuperAdmin={user.role === "super_admin"} />;
}

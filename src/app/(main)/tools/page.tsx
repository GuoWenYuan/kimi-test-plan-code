import { requireUserOrRedirect } from "@/lib/auth";
import ToolsPanel from "./ToolsPanel";

export default async function ToolsPage() {
  await requireUserOrRedirect();
  return <ToolsPanel />;
}

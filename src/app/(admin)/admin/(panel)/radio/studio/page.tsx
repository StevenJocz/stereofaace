import { requirePermission } from "@/lib/auth/session";
import { StudioConsole } from "@/ui/studio/StudioConsole";

export default async function StudioPage() {
  await requirePermission("station:update");
  return (
    <StudioConsole />
  );
}

import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getRelayPublic } from "@/modules/studio/relay";
import { StudioConsole } from "@/ui/studio/StudioConsole";

export default async function StudioPage() {
  const user = await requirePermission("station:update");
  const relay = await getRelayPublic(await getDb(), user);
  return <StudioConsole relay={relay} />;
}

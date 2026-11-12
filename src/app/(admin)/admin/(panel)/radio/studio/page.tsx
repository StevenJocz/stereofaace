import { requirePermission } from "@/lib/auth/session";

/** La consola vive en el layout del panel (PersistentStudio) para que la transmisión siga al navegar; aquí solo se exige el permiso. */
export default async function StudioPage() {
  await requirePermission("station:update");
  return null;
}

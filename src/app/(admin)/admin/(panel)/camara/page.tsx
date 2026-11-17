import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";

/** La cámara en cabina vive dentro del estudio (pestaña «Cámara»): así el locutor emite audio y video desde un solo lugar. */
export default async function CameraPage() {
  await requirePermission("studio:update");
  redirect("/admin/radio/studio");
}

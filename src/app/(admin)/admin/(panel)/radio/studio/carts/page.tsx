import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listCarts } from "@/modules/studio/carts";
import { PageHead } from "@/ui/admin/fields";
import { CartManager } from "@/ui/studio/CartManager";

export default async function CartsAdminPage() {
  const user = await requirePermission("station:update");
  const carts = await listCarts(await getDb(), user);
  return (
    <>
      <PageHead
        eyebrow="StereoFace Radio"
        title="Cart Wall"
        action={
          <Link href="/admin/radio/studio" className="btn">
            Ir al estudio
          </Link>
        }
      />
      <p className="mt-3 max-w-[70ch] text-muted">
        Jingles, promos, cortinillas, efectos, anuncios e identificaciones: todo lo que no es música. Aparecen como
        botones en el estudio y suenan al instante encima de la música. MP3, WAV, OGG, M4A o FLAC de hasta 25 MB.
      </p>
      <div className="mt-8">
        <CartManager initial={carts} canDelete={can(user.role, "station:delete")} />
      </div>
    </>
  );
}

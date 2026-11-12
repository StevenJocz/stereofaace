import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listGenres } from "@/modules/taxonomy/service";
import { StationForm } from "@/ui/admin/StationForms";

export default async function NewStationPage() {
  await requirePermission("station:create");
  const genres = await listGenres(await getDb());
  return (
    <>
      <Link href="/admin/radio" className="mono text-muted hover:text-accent-ink">
        ← Emisoras
      </Link>
      <h1 className="display t-l mt-2">Nueva emisora</h1>
      <p className="mt-3 max-w-[70ch] text-muted">
        La emisora se crea <strong>desactivada</strong> y con la autorización <strong>pendiente</strong>. Un
        administrador debe registrar la autorización y activarla.
      </p>
      <div className="mt-8">
        <StationForm initial={{ streamKind: "hls" }} genres={genres} />
      </div>
    </>
  );
}

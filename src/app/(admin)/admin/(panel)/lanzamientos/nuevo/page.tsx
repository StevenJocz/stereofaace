import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArtistOptions } from "@/modules/artists/admin";
import { ReleaseForm } from "@/ui/admin/ReleaseForm";
import { PageHead } from "@/ui/admin/fields";

export default async function NewReleasePage() {
  const user = await requirePermission("release:create");
  const artists = await listArtistOptions(await getDb(), user);
  return (
    <>
      <PageHead eyebrow="Catálogo" title="Nuevo lanzamiento" action={<Link href="/admin/lanzamientos" className="btn">← Lanzamientos</Link>} />
      {artists.length === 0 && (
        <p role="alert" className="mono mt-4 text-[#ffb020]">
          Primero crea al menos un artista: cada lanzamiento necesita uno.
        </p>
      )}
      <div className="mt-8">
        <ReleaseForm initial={{ canPublish: can(user.role, "release:publish") }} artists={artists} />
      </div>
    </>
  );
}

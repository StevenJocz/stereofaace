import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listGenres } from "@/modules/taxonomy/service";
import { ArtistForm } from "@/ui/admin/ArtistForm";
import { PageHead } from "@/ui/admin/fields";

export default async function NewArtistPage() {
  await requirePermission("artist:create");
  const genres = await listGenres(await getDb());
  return (
    <>
      <PageHead eyebrow="Catálogo" title="Nuevo artista" action={<Link href="/admin/artistas" className="btn">← Artistas</Link>} />
      <div className="mt-8">
        <ArtistForm initial={{}} genres={genres.map((g) => ({ id: g.id, name: g.name }))} />
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getArtistAdmin } from "@/modules/artists/admin";
import { listGenres } from "@/modules/taxonomy/service";
import { ArtistForm } from "@/ui/admin/ArtistForm";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { restoreArtistAction } from "../actions";

export default async function EditArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const user = await requirePermission("artist:read");
  const { id } = await params;
  const db = await getDb();
  const [artist, genres, sp] = await Promise.all([getArtistAdmin(db, user, id), listGenres(db), searchParams]);
  if (!artist) notFound();

  return (
    <>
      <PageHead eyebrow="Catálogo" title={artist.name} action={<Link href="/admin/artistas" className="btn">← Artistas</Link>} />
      {sp.creado && <p role="status" className="mono mt-4 text-accent-ink">Artista creado.</p>}
      {artist.deletedAt && (
        <div className="mt-4 flex items-center gap-3">
          <span className="badge badge-bad">Oculto</span>
          {can(user.role, "artist:delete") && <RowAction action={restoreArtistAction} fields={{ id: artist.id }} label="Restaurar" />}
        </div>
      )}
      <div className="mt-8">
        <ArtistForm
          genres={genres.map((g) => ({ id: g.id, name: g.name }))}
          initial={{
            id: artist.id,
            name: artist.name,
            slug: artist.slug,
            bio: artist.bio ?? "",
            country: artist.country ?? "",
            genreIds: artist.genreIds,
            featured: artist.featured,
            photo: artist.photoId && artist.photoUrl ? { id: artist.photoId, url: artist.photoUrl } : null,
            coverArt: artist.coverArt,
            links: artist.links,
          }}
        />
      </div>
    </>
  );
}

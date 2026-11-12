import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArtistOptions } from "@/modules/artists/admin";
import { getReleaseAdmin } from "@/modules/releases/admin";
import { ReleaseForm } from "@/ui/admin/ReleaseForm";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { restoreReleaseAction } from "../actions";

export default async function EditReleasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const user = await requirePermission("release:read");
  const { id } = await params;
  const db = await getDb();
  const [release, artists, sp] = await Promise.all([getReleaseAdmin(db, user, id), listArtistOptions(db, user), searchParams]);
  if (!release) notFound();

  return (
    <>
      <PageHead eyebrow="Catálogo" title={release.title} action={<Link href="/admin/lanzamientos" className="btn">← Lanzamientos</Link>} />
      {sp.creado && <p role="status" className="mono mt-4 text-accent-ink">Lanzamiento creado.</p>}
      {release.deletedAt && (
        <div className="mt-4 flex items-center gap-3">
          <span className="badge badge-bad">Oculto</span>
          {can(user.role, "release:delete") && <RowAction action={restoreReleaseAction} fields={{ id: release.id }} label="Restaurar" />}
        </div>
      )}
      <div className="mt-8">
        <ReleaseForm
          artists={artists}
          initial={{
            id: release.id,
            title: release.title,
            slug: release.slug,
            kind: release.kind,
            releasedAt: release.releasedAt.toISOString().slice(0, 10),
            label: release.label ?? "",
            artistIds: release.artistIds,
            cover: release.coverId && release.coverUrl ? { id: release.coverId, url: release.coverUrl } : null,
            coverArt: release.coverArt,
            embedUrl: release.embedUrl ?? "",
            status: release.status,
            canPublish: can(user.role, "release:publish"),
          }}
        />
      </div>
    </>
  );
}

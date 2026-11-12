import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArtistOptions } from "@/modules/artists/admin";
import { getEventAdmin } from "@/modules/events/admin";
import { listGenres } from "@/modules/taxonomy/service";
import { toBogotaInput } from "@/ui/admin/countries";
import { EventForm } from "@/ui/admin/EventForm";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { restoreEventAction } from "../actions";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const user = await requirePermission("event:read");
  const { id } = await params;
  const db = await getDb();
  const [event, artists, genres, sp] = await Promise.all([
    getEventAdmin(db, user, id),
    listArtistOptions(db, user),
    listGenres(db),
    searchParams,
  ]);
  if (!event) notFound();

  return (
    <>
      <PageHead eyebrow="Catálogo" title={event.name} action={<Link href="/admin/agenda" className="btn">← Agenda</Link>} />
      {sp.creado && <p role="status" className="mono mt-4 text-accent-ink">Evento creado.</p>}
      {event.deletedAt && (
        <div className="mt-4 flex items-center gap-3">
          <span className="badge badge-bad">Oculto</span>
          {can(user.role, "event:delete") && <RowAction action={restoreEventAction} fields={{ id: event.id }} label="Restaurar" />}
        </div>
      )}
      <div className="mt-8">
        <EventForm
          artists={artists}
          genres={genres.map((g) => ({ id: g.id, name: g.name }))}
          initial={{
            id: event.id,
            name: event.name,
            slug: event.slug,
            kind: event.kind,
            startsAt: toBogotaInput(event.startsAt),
            endsAt: event.endsAt ? toBogotaInput(event.endsAt) : "",
            venue: event.venue ?? "",
            city: event.city,
            country: event.country,
            description: event.description ?? "",
            genreId: event.genreId ?? "",
            artistIds: event.artistIds,
            ticketUrl: event.ticketUrl ?? "",
            coverArt: event.coverArt,
            status: event.status,
            canPublish: can(user.role, "event:publish"),
          }}
        />
      </div>
    </>
  );
}

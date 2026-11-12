import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArtistOptions } from "@/modules/artists/admin";
import { listGenres } from "@/modules/taxonomy/service";
import { EventForm } from "@/ui/admin/EventForm";
import { PageHead } from "@/ui/admin/fields";

export default async function NewEventPage() {
  const user = await requirePermission("event:create");
  const db = await getDb();
  const [artists, genres] = await Promise.all([listArtistOptions(db, user), listGenres(db)]);
  return (
    <>
      <PageHead eyebrow="Catálogo" title="Nuevo evento" action={<Link href="/admin/agenda" className="btn">← Agenda</Link>} />
      <div className="mt-8">
        <EventForm
          initial={{ canPublish: can(user.role, "event:publish") }}
          artists={artists}
          genres={genres.map((g) => ({ id: g.id, name: g.name }))}
        />
      </div>
    </>
  );
}

import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { LibraryManager } from "@/ui/admin/LibraryManager";
import { PageHead } from "@/ui/admin/fields";

export default async function LibraryPage() {
  const user = await requirePermission("studio:update");
  return (
    <>
      <PageHead eyebrow="Radio" title="Biblioteca y programación" />
      <p className="muted mt-2 max-w-2xl">Sube canciones a AzuraCast, organízalas en carpetas y ponlas en la lista de cada programa: la música suena en los horarios de la Programación.</p>
      <div className="mt-8">
        <LibraryManager canEditSchedule={can(user.role, "station:update")} />
      </div>
    </>
  );
}

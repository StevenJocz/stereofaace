import { requirePermission } from "@/lib/auth/session";
import { LibraryManager } from "@/ui/admin/LibraryManager";
import { PageHead } from "@/ui/admin/fields";

export default async function LibraryPage() {
  await requirePermission("studio:update");
  return (
    <>
      <PageHead eyebrow="Radio" title="Biblioteca y programación" />
      <p className="muted mt-2 max-w-2xl">Sube canciones a AzuraCast, organízalas en carpetas y programa cuándo suena cada lista del AutoDJ.</p>
      <div className="mt-8">
        <LibraryManager />
      </div>
    </>
  );
}

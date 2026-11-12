import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listCategories } from "@/modules/taxonomy/service";
import { PageHead } from "@/ui/admin/fields";
import { SourceForm } from "@/ui/admin/SourceForm";

export default async function NewSourcePage() {
  await requirePermission("source:create");
  const categories = await listCategories(await getDb());
  return (
    <>
      <PageHead eyebrow="Sistema" title="Nueva fuente" action={<Link href="/admin/fuentes" className="btn">← Fuentes</Link>} />
      <p className="mt-4 text-muted">La fuente se registra desactivada. Verifica sus términos antes de activarla.</p>
      <div className="mt-8">
        <SourceForm initial={{}} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    </>
  );
}

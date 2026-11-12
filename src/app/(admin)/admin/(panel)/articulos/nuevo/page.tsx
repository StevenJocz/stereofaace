import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { categories } from "@/modules/taxonomy/schema";
import { NewArticleForm } from "@/ui/admin/NewArticleForm";

export default async function NewArticlePage() {
  await requirePermission("article:create");
  const cats = await (
    await getDb()
  )
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.position));
  return (
    <>
      <Link href="/admin/articulos" className="mono text-muted hover:text-accent-ink">
        ← Artículos
      </Link>
      <h1 className="display t-l mt-2">Nuevo artículo</h1>
      <p className="mt-3 max-w-[60ch] text-muted">
        Empieza con el título y la categoría; el resto se completa en el editor.
      </p>
      <div className="mt-8 max-w-xl">
        <NewArticleForm categories={cats} />
      </div>
    </>
  );
}

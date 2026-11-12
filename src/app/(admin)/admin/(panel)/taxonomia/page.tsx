import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listTaxonomy, type TaxonomyKind } from "@/modules/taxonomy/admin";
import { PageHead } from "@/ui/admin/fields";
import { TaxonomyForm } from "@/ui/admin/TaxonomyForms";

const TABS: { kind: TaxonomyKind; label: string; note: string }[] = [
  { kind: "category", label: "Categorías", note: "El orden de las categorías define el ticker y el riel de la portada." },
  { kind: "tag", label: "Etiquetas", note: "Etiquetas libres para clasificar artículos." },
  { kind: "genre", label: "Géneros", note: "Se usan en artistas, eventos y emisoras." },
];

export default async function TaxonomyAdminPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const user = await requirePermission("category:read");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.kind === sp.tipo) ?? TABS[0];
  const kind = tab.kind;
  const items = can(user.role, kind === "tag" ? "tag:read" : "category:read") ? await listTaxonomy(await getDb(), user, kind) : [];
  const res = kind === "tag" ? "tag" : "category";

  return (
    <>
      <PageHead eyebrow="Organización" title="Taxonomía" />
      <nav className="mono mt-6 flex flex-wrap gap-4" aria-label="Tipo de clasificación">
        {TABS.map((t) => (
          <Link
            key={t.kind}
            href={`/admin/taxonomia?tipo=${t.kind}`}
            aria-current={t.kind === kind ? "page" : undefined}
            className={t.kind === kind ? "text-accent-ink underline underline-offset-4" : "text-muted hover:text-accent-ink"}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="mt-4 max-w-[70ch] text-muted">{tab.note} Lo que está en uso no se puede borrar.</p>

      <ul className="mt-8 grid gap-3">
        {can(user.role, `${res}:create`) && <TaxonomyForm key={`new-${kind}`} kind={kind} canSave canDelete={false} />}
        {items.map((i) => (
          <TaxonomyForm
            key={i.id}
            kind={kind}
            item={i}
            canSave={can(user.role, `${res}:update`)}
            canDelete={can(user.role, `${res}:delete`)}
          />
        ))}
      </ul>
      {items.length === 0 && <p className="mt-6 text-muted">Todavía no hay elementos.</p>}
    </>
  );
}

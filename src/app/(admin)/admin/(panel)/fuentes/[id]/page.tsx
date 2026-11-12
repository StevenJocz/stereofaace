import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getSourceAdmin } from "@/modules/ingest/admin";
import { listCategories } from "@/modules/taxonomy/service";
import { ConfirmDelete } from "@/ui/admin/ConfirmDelete";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { SourceForm } from "@/ui/admin/SourceForm";
import { deleteSourceAction, sourceActiveAction, verifyTermsAction } from "../actions";

export default async function EditSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string }>;
}) {
  const user = await requirePermission("source:read");
  const { id } = await params;
  const db = await getDb();
  const [source, categories, sp] = await Promise.all([getSourceAdmin(db, user, id), listCategories(db), searchParams]);
  if (!source) notFound();
  const manage = can(user.role, "source:manage");

  return (
    <>
      <PageHead eyebrow="Sistema" title={source.name} action={<Link href="/admin/fuentes" className="btn">← Fuentes</Link>} />
      {sp.creada && <p role="status" className="mono mt-4 text-accent-ink">Fuente registrada (desactivada).</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {source.active ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-idle">Desactivada</span>}
        {source.termsVerifiedAt ? <span className="badge badge-ok">Términos verificados</span> : <span className="badge badge-warn">Términos sin verificar</span>}
        {manage && !source.termsVerifiedAt && <RowAction action={verifyTermsAction} fields={{ id: source.id }} label="Marcar términos verificados" />}
        {manage && (
          <RowAction
            action={sourceActiveAction}
            fields={{ id: source.id, active: source.active ? "0" : "1" }}
            label={source.active ? "Desactivar" : "Activar"}
          />
        )}
      </div>
      <p className="mt-3 max-w-[70ch] text-muted">Verifica los términos de la fuente y su licencia antes de marcar la casilla. Marcarlos es una decisión registrada en la auditoría.</p>
      <div className="mt-8">
        <SourceForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          initial={{
            id: source.id,
            name: source.name,
            kind: source.kind,
            url: source.url,
            intervalMinutes: source.intervalMinutes,
            defaultCategoryId: source.defaultCategoryId,
            rightsPolicy: source.rightsPolicy,
            publishPolicy: source.publishPolicy,
            dailyLimit: source.dailyLimit,
            legalNotes: source.legalNotes,
          }}
        />
      </div>
      {can(user.role, "source:delete") && (
        <div className="mt-12 border-t border-line pt-6">
          <h2 className="mono mb-3 text-muted">Borrar fuente</h2>
          <ConfirmDelete id={source.id} action={deleteSourceAction} />
        </div>
      )}
    </>
  );
}

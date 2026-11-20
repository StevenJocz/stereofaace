import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getSourceAdmin } from "@/modules/ingest/admin";
import { listRuns, pendingCount } from "@/modules/ingest/run";
import { listCategories } from "@/modules/taxonomy/service";
import { ConfirmDelete } from "@/ui/admin/ConfirmDelete";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { SourceForm } from "@/ui/admin/SourceForm";
import { SourceRunButton } from "@/ui/admin/SourceRunButton";
import { deleteSourceAction, probeSourceAction, resumeSourceAction, runSourceAction, sourceActiveAction, verifyTermsAction } from "../actions";

const when = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" });

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
  const [runs, pending] = await Promise.all([listRuns(db, user, id), pendingCount(db, user, id)]);
  const reads = source.kind === "rss" || source.kind === "atom";
  const canRun = source.active && Boolean(source.termsVerifiedAt) && !source.paused;
  const nextRun = source.active && !source.paused && source.lastRunAt ? new Date(source.lastRunAt.getTime() + source.intervalMinutes * 60_000) : null;

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
      {source.paused && (
        <p role="alert" className="mono mt-3 text-[#ffb020]">
          Pausada tras {source.consecutiveFailures} fallos seguidos. Revisa la dirección del feed y reanúdala.
        </p>
      )}
      <p className="mt-3 max-w-[70ch] text-muted">Verifica los términos de la fuente y su licencia antes de marcar la casilla. Marcarlos es una decisión registrada en la auditoría.</p>
      {reads && (
        <section className="panel mt-8 p-5" aria-label="Lectura del feed">
          <h2 className="display-up text-[1.15rem]">Lectura del feed</h2>
          <p className="mt-2 max-w-[70ch] text-muted">
            Cuando la fuente está activa se lee sola cada {source.intervalMinutes} minutos y crea un <strong>borrador</strong> por cada nota nueva (título, extracto del feed, enlace y atribución). La imagen —la del feed o, si no trae, la que la página de la nota declara para sus avances— solo se añade si la política de derechos <strong>no</strong> es «solo metadatos»; al cambiarla, la siguiente lectura rellena también los borradores recientes. El texto completo de las notas no se trae. Nada se publica solo: los borradores se revisan en{" "}
            <Link href="/admin/articulos?estado=draft" className="underline">Artículos</Link>.
          </p>
          <dl className="mono mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[0.74rem]">
            <div><dt className="inline text-muted">Última lectura: </dt><dd className="inline">{source.lastRunAt ? when.format(source.lastRunAt) : "nunca"}</dd></div>
            {nextRun && <div><dt className="inline text-muted">Próxima: </dt><dd className="inline">{when.format(nextRun)}</dd></div>}
            <div><dt className="inline text-muted">Borradores por revisar: </dt><dd className="inline">{pending}</dd></div>
          </dl>
          {manage && (
            <div className="mt-4 flex flex-wrap items-start gap-4">
              <SourceRunButton action={probeSourceAction} id={source.id} label="Probar el feed" pendingLabel="Probando…" title="Lo descarga y lo lee, sin guardar nada" />
              <SourceRunButton
                action={runSourceAction}
                id={source.id}
                label="Ejecutar ahora"
                pendingLabel="Leyendo…"
                accent
                disabled={!canRun}
                title={canRun ? "Lee el feed y crea los borradores nuevos" : "Verifica los términos y activa la fuente para poder leerla"}
              />
              {source.paused && <RowAction action={resumeSourceAction} fields={{ id: source.id }} label="Reanudar" />}
            </div>
          )}
          {manage && !canRun && <p className="mono muted mt-2 text-[0.68rem]">Para «Ejecutar ahora» y la lectura automática: marca los términos como verificados y activa la fuente. «Probar el feed» funciona siempre.</p>}

          <h3 className="mono mt-6 text-muted">Últimas lecturas</h3>
          {runs.length === 0 ? (
            <p className="mt-2 text-muted">Todavía no se ha leído esta fuente.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-[0.82rem]">
                <thead>
                  <tr className="mono border-b border-line text-muted">
                    <th className="py-2 pr-4 font-normal">Inicio</th>
                    <th className="py-2 pr-4 font-normal">Resultado</th>
                    <th className="py-2 pr-4 font-normal">Nuevos</th>
                    <th className="py-2 pr-4 font-normal">Ya conocidos</th>
                    <th className="py-2 pr-4 font-normal">Errores</th>
                    <th className="py-2 font-normal">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-line align-top">
                      <td className="mono py-2 pr-4 whitespace-nowrap">{when.format(r.startedAt)}</td>
                      <td className="py-2 pr-4">
                        {r.status === "ok" ? <span className="badge badge-ok">Correcta</span> : r.status === "error" ? <span className="badge badge-bad">Con error</span> : <span className="badge badge-idle">En curso</span>}
                      </td>
                      <td className="mono py-2 pr-4">{r.newItems}</td>
                      <td className="mono py-2 pr-4">{r.duplicates}</td>
                      <td className="mono py-2 pr-4">{r.errors}</td>
                      <td className="py-2 text-muted">{(r.log as { message?: string } | null)?.message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
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

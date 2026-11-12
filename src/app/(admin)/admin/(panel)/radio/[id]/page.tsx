import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getStationAdmin } from "@/modules/radio/service";
import { listGenres } from "@/modules/taxonomy/service";
import { AuthorizationForm, DeleteForm, EnableForm, StationForm } from "@/ui/admin/StationForms";

export default async function StationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string }>;
}) {
  const user = await requirePermission("station:read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await getDb();
  const [s, genres, sp] = await Promise.all([getStationAdmin(db, user, id), listGenres(db), searchParams]);
  if (!s) notFound();

  const cleared = s.authorizationStatus === "granted" || s.authorizationStatus === "not_required";
  const hasSource = s.streamKind === "embed" ? !!s.embedUrl : !!s.streamUrl;
  const blocked = !cleared
    ? "Falta la autorización de retransmisión o un reproductor oficial integrable."
    : !hasSource
      ? "Falta la URL de la señal."
      : undefined;

  return (
    <>
      <Link href="/admin/radio" className="mono text-muted hover:text-accent-ink">
        ← Emisoras
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="display t-l">{s.name}</h1>
        <span className={`badge ${s.enabled ? "badge-ok" : "badge-idle"}`}>{s.enabled ? "Activa" : "Inactiva"}</span>
      </div>
      {sp.creada && (
        <p role="status" className="mono mt-3 text-accent-ink">
          Emisora creada. Registra la autorización y actívala cuando corresponda.
        </p>
      )}

      <section aria-labelledby="estado" className="panel mt-8 p-5">
        <h2 id="estado" className="display-up text-[1.1rem]">
          Estado en el reproductor
        </h2>
        <div className="mt-4">
          {can(user.role, "station:publish") ? (
            <EnableForm id={s.id} enabled={s.enabled} blockedReason={blocked} />
          ) : (
            <p className="mono text-muted">Tu rol no puede activar ni desactivar emisoras.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="auth" className="panel mt-6 p-5">
        <h2 id="auth" className="display-up text-[1.1rem]">
          Autorización de retransmisión
        </h2>
        <p className="mt-2 max-w-[70ch] text-muted">
          No se retransmite ni se enlaza una señal sin permiso. Registra aquí la evidencia (correo, contrato, licencia)
          o el uso de un reproductor oficial integrable. Quitar la autorización desactiva la emisora al instante.
        </p>
        <div className="mt-5 max-w-xl">
          {can(user.role, "station:manage") ? (
            <AuthorizationForm id={s.id} status={s.authorizationStatus} notes={s.authorizationNotes} />
          ) : (
            <p className="mono text-muted">Estado: {s.authorizationStatus}. Solo administradores pueden cambiarlo.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="datos" className="mt-10">
        <h2 id="datos" className="display-up mb-5 text-[1.1rem]">
          Datos de la emisora
        </h2>
        {can(user.role, "station:update") ? (
          <StationForm
            genres={genres}
            initial={{
              id: s.id,
              name: s.name,
              slug: s.slug,
              description: s.description ?? "",
              country: s.country ?? "",
              genreIds: s.genreIds,
              streamKind: s.streamKind,
              streamUrl: s.streamUrl ?? "",
              embedUrl: s.embedUrl ?? "",
              corsEnabled: s.corsEnabled,
              imageUrl: s.imageUrl ?? "",
              websiteUrl: s.websiteUrl ?? "",
              attributionName: s.attributionName,
              attributionUrl: s.attributionUrl,
              attributionNote: s.attributionNote ?? "",
              position: s.position,
            }}
          />
        ) : (
          <p className="mono text-muted">Tu rol solo puede consultar esta emisora.</p>
        )}
      </section>

      {can(user.role, "station:delete") && (
        <section aria-labelledby="peligro" className="mt-12 border-t border-line pt-6">
          <h2 id="peligro" className="display-up text-[1.1rem] text-[#ff8a8a]">
            Zona delicada
          </h2>
          <p className="mt-2 text-muted">Borrar la emisora la retira del reproductor y de este listado.</p>
          <div className="mt-4">
            <DeleteForm id={s.id} />
          </div>
        </section>
      )}
    </>
  );
}

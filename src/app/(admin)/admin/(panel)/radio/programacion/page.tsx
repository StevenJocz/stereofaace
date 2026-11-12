import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listProgramsAdmin, listSlotsAdmin } from "@/modules/schedule/service";
import { PageHead } from "@/ui/admin/fields";
import { ProgramForm, SchedulePreview, SlotForm } from "@/ui/admin/ProgramForms";

export default async function ProgramacionPage() {
  const user = await requirePermission("station:update");
  const db = await getDb();
  const [programs, slots] = await Promise.all([listProgramsAdmin(db, user), listSlotsAdmin(db, user)]);
  const canDelete = can(user.role, "station:delete");
  return (
    <>
      <PageHead eyebrow="StereoFace Radio" title="Programación" />
      <p className="mt-3 max-w-[70ch] text-muted">
        Crea los programas de la emisora (nombre, imagen, descripción y el DJ que lo conduce) y ponles horario. En el
        reproductor del sitio se muestra el programa que está al aire y, al pulsarlo, la programación completa del día,
        la semana o el mes. El DJ que entra al estudio ve su programa a su hora.
      </p>

      <section className="mt-10" aria-labelledby="parrilla-h">
        <h2 id="parrilla-h" className="display t-s">Parrilla</h2>
        <div className="mt-4">
          <SchedulePreview programs={programs} slots={slots} />
        </div>
        <div className="mt-6">
          <SlotForm programs={programs} />
        </div>
      </section>

      <section className="mt-14" aria-labelledby="programas-h">
        <h2 id="programas-h" className="display t-s">Programas ({programs.length})</h2>
        <details className="mt-4">
          <summary className="btn btn-accent w-fit cursor-pointer">Nuevo programa</summary>
          <div className="mt-3">
            <ProgramForm />
          </div>
        </details>
        <ul className="mt-6 grid gap-4">
          {programs.map((p) => (
            <li key={p.id}>
              <details>
                <summary className="panel flex cursor-pointer flex-wrap items-center gap-3 p-3">
                  <span className="h-6 w-6 rounded-md" style={{ background: p.color }} aria-hidden="true" />
                  <span className="font-bold">{p.name}</span>
                  <span className="mono muted">
                    {p.slots} horarios{p.djUsername ? ` · DJ ${p.djUsername}` : ""}{p.active ? "" : " · inactivo"}
                  </span>
                </summary>
                <div className="mt-2">
                  <ProgramForm program={p} canDelete={canDelete} />
                </div>
              </details>
            </li>
          ))}
          {programs.length === 0 && <li className="text-muted">Todavía no hay programas.</li>}
        </ul>
      </section>
    </>
  );
}

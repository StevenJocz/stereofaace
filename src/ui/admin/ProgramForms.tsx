"use client";

import { useActionState, useState } from "react";
import { addSlotAction, deleteProgramAction, removeSlotAction, saveProgramAction } from "@/app/(admin)/admin/(panel)/radio/programacion/actions";
import type { FormState } from "@/lib/admin/form";
import type { ProgramAdminView, SlotAdminView } from "@/modules/schedule/service";
import { ConfirmDelete } from "./ConfirmDelete";
import { MediaPicker } from "./MediaPicker";
import { RowAction } from "./RowAction";
import { Field, Message } from "./fields";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ProgramForm({ program, canDelete }: { program?: ProgramAdminView; canDelete?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProgramAction, null);
  const v = (k: string, fallback = "") => String(state?.values?.[k] ?? fallback);
  const e = (k: string) => state?.errors?.[k];
  const id = program?.id;
  return (
    <div className="panel p-4">
      <form key={state?.nonce ?? "init"} action={action} className="grid gap-4 md:grid-cols-2" noValidate>
        {id && <input type="hidden" name="id" value={id} />}
        <Field label="Nombre del programa *" name={`name-${id ?? "new"}`} errors={e("name")}>
          <input id={`name-${id ?? "new"}`} name="name" className="input" required maxLength={80} defaultValue={v("name", program?.name)} />
        </Field>
        <Field label="Locutores (se muestran al público)" name={`hosts-${id ?? "new"}`} errors={e("hosts")}>
          <input id={`hosts-${id ?? "new"}`} name="hosts" className="input" maxLength={120} defaultValue={v("hosts", program?.hosts ?? "")} />
        </Field>
        <Field label="Descripción breve" name={`desc-${id ?? "new"}`} errors={e("description")} className="md:col-span-2" hint="Hasta 300 caracteres. Sale en el reproductor y en la programación.">
          <textarea id={`desc-${id ?? "new"}`} name="description" className="input" maxLength={300} rows={2} defaultValue={v("description", program?.description ?? "")} />
        </Field>
        <Field
          label="Usuario del DJ en AzuraCast"
          name={`dj-${id ?? "new"}`}
          errors={e("djUsername")}
          hint="Por ejemplo dj1. Quien entre al estudio con ese usuario verá este programa a su hora. No se muestra al público."
        >
          <input id={`dj-${id ?? "new"}`} name="djUsername" className="input" maxLength={50} autoCapitalize="none" defaultValue={v("djUsername", program?.djUsername ?? "")} />
        </Field>
        <div className="grid grid-cols-[auto_1fr] items-end gap-4">
          <Field label="Color" name={`color-${id ?? "new"}`} errors={e("color")}>
            <input id={`color-${id ?? "new"}`} name="color" type="color" className="input !p-1 h-[2.6rem] w-16" defaultValue={v("color", program?.color ?? "#c6ff00")} />
          </Field>
          <label className="mono muted flex items-center gap-2 pb-3">
            <input type="checkbox" name="active" defaultChecked={program ? program.active : true} /> Activo (aparece en la parrilla)
          </label>
        </div>
        <div className="md:col-span-2">
          <MediaPicker name="photoId" label="Imagen del programa" initial={program?.photoId && program.photoUrl ? { id: program.photoId, url: program.photoUrl } : null} />
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" className="btn btn-accent" disabled={pending}>
            {id ? "Guardar programa" : "Crear programa"}
          </button>
          <Message state={state} />
        </div>
      </form>
      {id && canDelete && (
        <div className="mt-3 border-t border-line pt-3">
          <ConfirmDelete id={id} action={deleteProgramAction} label="Borrar programa" />
        </div>
      )}
    </div>
  );
}

export function SlotForm({ programs }: { programs: ProgramAdminView[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSlotAction, null);
  const [kind, setKind] = useState<"weekly" | "once">("weekly");
  const e = (k: string) => state?.errors?.[k];
  return (
    <form action={action} className="panel grid gap-3 p-4 md:grid-cols-6" noValidate aria-label="Agregar un horario">
      <h3 className="display-up text-[1.2rem] md:col-span-6">Agregar horario</h3>
      <label className="md:col-span-2">
        <span className="mono muted block">Programa *</span>
        <select name="programId" className="input w-full" required>
          {programs
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span className="mono muted block">Se repite</span>
        <select name="kind" className="input w-full" value={kind} onChange={(ev) => setKind(ev.target.value as "weekly" | "once")}>
          <option value="weekly">Cada semana</option>
          <option value="once">Una sola vez</option>
        </select>
      </label>
      {kind === "weekly" ? (
        <label>
          <span className="mono muted block">Día</span>
          <select name="weekday" className="input w-full" defaultValue="1">
            {WEEK_ORDER.map((d) => (
              <option key={d} value={d}>
                {DAYS[d]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          <span className="mono muted block">Fecha</span>
          <input name="date" type="date" className="input w-full" required />
        </label>
      )}
      <label>
        <span className="mono muted block">Desde</span>
        <input name="start" type="time" className="input w-full" required defaultValue="18:00" />
      </label>
      <label>
        <span className="mono muted block">Hasta</span>
        <input name="end" type="time" className="input w-full" required defaultValue="20:00" />
      </label>
      <p className="mono muted md:col-span-6">Horas de Bogotá. Si «hasta» es menor que «desde», el programa cruza la medianoche (por ejemplo 22:00 a 02:00). Un horario único reemplaza al semanal en ese momento.</p>
      <div className="flex flex-wrap items-center gap-3 md:col-span-6">
        <button type="submit" className="btn btn-accent" disabled={pending || programs.length === 0}>
          Agregar horario
        </button>
        <Message state={state} />
        {Object.values(state?.errors ?? {}).flat().length > 0 && (
          <span role="alert" className="mono text-[#ff8a8a]">
            {Object.values(e("end") ?? e("weekday") ?? e("date") ?? e("start") ?? []).join(" ")}
          </span>
        )}
      </div>
    </form>
  );
}

export function SchedulePreview({ programs, slots }: { programs: ProgramAdminView[]; slots: SlotAdminView[] }) {
  const byId = new Map(programs.map((p) => [p.id, p]));
  const weekly = (d: number) => slots.filter((s) => s.kind === "weekly" && s.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
  const once = slots.filter((s) => s.kind === "once").sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const Row = ({ s }: { s: SlotAdminView }) => {
    const p = byId.get(s.programId);
    return (
      <li className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1" style={{ borderLeft: `4px solid ${p?.color ?? "#888"}` }}>
        <span className="min-w-0">
          <span className="block truncate font-bold">{p?.name ?? "—"}</span>
          <span className="mono muted">
            {s.kind === "once" ? `${s.date} · ` : ""}
            {s.start}–{s.end}
          </span>
        </span>
        <RowAction action={removeSlotAction} fields={{ id: s.id }} label="✕" ariaLabel={`Quitar el horario de ${p?.name ?? "programa"} ${s.start}`} />
      </li>
    );
  };
  return (
    <section aria-label="Parrilla semanal" className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        {WEEK_ORDER.map((d) => (
          <div key={d}>
            <p className="display-up text-[1.05rem]">{DAYS[d]}</p>
            <ul className="mt-2 grid gap-2">
              {weekly(d).map((s) => (
                <Row key={s.id} s={s} />
              ))}
              {weekly(d).length === 0 && <li className="mono muted">Sin programas</li>}
            </ul>
          </div>
        ))}
      </div>
      {once.length > 0 && (
        <div>
          <p className="display-up text-[1.05rem]">Horarios únicos</p>
          <ul className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {once.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

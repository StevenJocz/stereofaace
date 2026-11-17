"use client";

import { useActionState, useState } from "react";
import { assignProgramsAction, createUserAction, resetPasswordAction, resyncDjAction, updateUserAction } from "@/app/(admin)/admin/(panel)/usuarios/actions";
import type { FormState } from "@/lib/admin/form";
import { ROLE_LABEL } from "./options";
import { Field, Message } from "./fields";

export type UserFormValues = { id?: string; email?: string; name?: string; role?: string; active?: boolean };

/** Alta de usuario o edición de nombre, rol y estado. `roles` son los que quien administra puede asignar. */
export type ProgramOption = { id: string; name: string; djUsername: string | null };

export function UserForm({ initial, roles, readOnly = false, programs = [] }: { initial: UserFormValues; roles: string[]; readOnly?: boolean; programs?: ProgramOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(initial.id ? updateUserAction : createUserAction, null);
  const v = (k: string, fallback?: string) => String(state?.values?.[k] ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const options = initial.role && !roles.includes(initial.role) ? [initial.role, ...roles] : roles;
  const [role, setRole] = useState(String(initial.role ?? "editor"));

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Nombre *" name="name" errors={e("name")}>
        <input id="name" name="name" className="input" required maxLength={120} defaultValue={v("name", initial.name)} disabled={readOnly} />
      </Field>
      <Field label="Correo *" name="email" errors={e("email")} hint={initial.id ? "El correo no se puede cambiar." : undefined}>
        <input id="email" name="email" type="email" className="input" required maxLength={254} defaultValue={v("email", initial.email)} disabled={!!initial.id || readOnly} />
      </Field>
      <Field label="Rol *" name="role" errors={e("role")}>
        <select id="role" name="role" className="input" defaultValue={v("role", initial.role ?? "editor")} disabled={readOnly} onChange={(ev) => setRole(ev.target.value)}>
          {options.map((r) => (
            <option key={r} value={r} disabled={!roles.includes(r)}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </select>
      </Field>
      {!initial.id && role === "locutor" && (
        <Field
          label="Programa que conducirá *"
          name="programId"
          errors={e("programId")}
          hint="Se crea su cuenta de DJ en AzuraCast con el horario de este programa. Solo podrá emitir en ese horario."
          className="md:col-span-2"
        >
          <select id="programId" name="programId" className="input" required defaultValue={v("programId")}>
            <option value="">Elige un programa…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.djUsername ? ` (hoy: ${p.djUsername})` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      {initial.id ? (
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="active" defaultChecked={state?.values ? state.values.active === "on" : !!initial.active} disabled={readOnly} />
          <span>Cuenta activa (si se desactiva, se cierran sus sesiones)</span>
        </label>
      ) : (
        <Field label="Contraseña inicial *" name="password" errors={e("password")} hint="Mínimo 12 caracteres. Compártela por un canal seguro.">
          <input id="password" name="password" type="password" className="input" required minLength={12} maxLength={200} autoComplete="new-password" />
        </Field>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" className="btn btn-accent" disabled={pending}>
            {initial.id ? "Guardar cambios" : "Crear usuario"}
          </button>
          <Message state={state} />
        </div>
      )}
    </form>
  );
}

/** Restablecer la contraseña de un usuario. */
export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, null);
  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid max-w-md gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field label="Nueva contraseña" name="reset-password" errors={state?.errors?.password} hint="Mínimo 12 caracteres.">
        <input id="reset-password" name="password" type="password" className="input" required minLength={12} maxLength={200} autoComplete="new-password" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn !px-4 !py-2" disabled={pending}>
          Restablecer contraseña
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** Locutor: programas que conduce (definen su horario en AzuraCast) y estado de su cuenta de DJ. */
export function DjPanel({ id, djUsername, programs }: { id: string; djUsername: string | null; programs: ProgramOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(assignProgramsAction, null);
  const [syncState, syncAction, syncing] = useActionState<FormState, FormData>(resyncDjAction, null);
  return (
    <div className="grid max-w-2xl gap-6">
      <p className="mono muted">
        Usuario de DJ en AzuraCast: <span className="text-fg">{djUsername ?? "—"}</span>. La clave la genera el sistema; el locutor no la escribe: entra al estudio con su sesión y solo en su horario.
      </p>
      <form key={state?.nonce ?? "init"} action={action} className="grid gap-3">
        <input type="hidden" name="id" value={id} />
        <fieldset className="grid gap-2">
          <legend className="mono mb-1 text-muted">Programas que conduce</legend>
          {programs.length === 0 && <p className="muted">Aún no hay programas. Créalos en Programación.</p>}
          {programs.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input type="checkbox" name="programIds" value={p.id} defaultChecked={p.djUsername?.toLowerCase() === djUsername?.toLowerCase()} />
              <span>
                {p.name}
                {p.djUsername && p.djUsername.toLowerCase() !== djUsername?.toLowerCase() ? <span className="muted"> · hoy lo conduce {p.djUsername}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-accent !px-4 !py-2" disabled={pending}>
            Guardar programas
          </button>
          <Message state={state} />
        </div>
      </form>
      <form key={syncState?.nonce ?? "sync"} action={syncAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn !px-4 !py-2" disabled={syncing}>
          Sincronizar con AzuraCast
        </button>
        <Message state={syncState} />
      </form>
    </div>
  );
}

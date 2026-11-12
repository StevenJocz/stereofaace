"use client";

import { useActionState } from "react";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/app/(admin)/admin/(panel)/usuarios/actions";
import type { FormState } from "@/lib/admin/form";
import { ROLE_LABEL } from "./options";
import { Field, Message } from "./fields";

export type UserFormValues = { id?: string; email?: string; name?: string; role?: string; active?: boolean };

/** Alta de usuario o edición de nombre, rol y estado. `roles` son los que quien administra puede asignar. */
export function UserForm({ initial, roles, readOnly = false }: { initial: UserFormValues; roles: string[]; readOnly?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(initial.id ? updateUserAction : createUserAction, null);
  const v = (k: string, fallback?: string) => String(state?.values?.[k] ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const options = initial.role && !roles.includes(initial.role) ? [initial.role, ...roles] : roles;

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
        <select id="role" name="role" className="input" defaultValue={v("role", initial.role ?? "editor")} disabled={readOnly}>
          {options.map((r) => (
            <option key={r} value={r} disabled={!roles.includes(r)}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </select>
      </Field>
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

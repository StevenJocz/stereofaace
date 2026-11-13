"use client";

import { useActionState } from "react";
import { saveFacebookAction, syncFacebookNowAction } from "@/app/(admin)/admin/(panel)/ajustes/facebook/actions";
import type { FormState } from "@/lib/admin/form";
import { Field, Message } from "@/ui/admin/fields";

export function FacebookSettingsForm({ initial, syncUrl }: { initial: { enabled: boolean; hasToken: boolean; since: string | null }; syncUrl: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFacebookAction, null);
  const [syncState, syncAction, syncing] = useActionState<FormState, FormData>(syncFacebookNowAction, null);
  const e = (k: string) => state?.errors?.[k];
  return (
    <div className="grid max-w-[60ch] gap-6">
      <form key={state?.nonce ?? "init"} action={action} className="grid gap-4" noValidate>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="enabled" className="mt-1" defaultChecked={initial.enabled} />
          <span>
            Publicar en Facebook cada nota que se publique
            {initial.since && initial.enabled && <span className="mono muted block">Activo desde {new Date(initial.since).toLocaleString("es-CO", { timeZone: "America/Bogota" })}.</span>}
          </span>
        </label>
        <Field
          label={initial.hasToken ? "Token de la página (ya hay uno guardado)" : "Token de la página *"}
          name="token"
          errors={e("token")}
          hint="Token de acceso de PÁGINA con el permiso pages_manage_posts. Se guarda solo en el servidor y no se vuelve a mostrar. Vacío conserva el actual."
        >
          <input id="token" name="token" type="password" className="input" autoComplete="off" placeholder={initial.hasToken ? "•••••••• (guardado)" : ""} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-accent" disabled={pending}>
            Guardar
          </button>
          <Message state={state} />
        </div>
      </form>

      {initial.enabled && (
        <form action={syncAction} className="grid gap-2">
          <h3 className="display-up text-[1.1rem]">Notas programadas</h3>
          <p className="text-muted">
            Las notas publicadas desde el editor se suben solas. Las programadas salen del sitio a su hora, sin que nadie pulse nada, así que necesitan un aviso externo:
            haz que un monitor (por ejemplo Uptime Kuma) abra esta dirección cada 5 minutos.
          </p>
          {syncUrl && <input readOnly className="input mono text-[0.72rem]" value={syncUrl} aria-label="Dirección para el monitor" onFocus={(ev) => ev.currentTarget.select()} />}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn" disabled={syncing}>
              Publicar pendientes ahora
            </button>
            <Message state={syncState} />
          </div>
        </form>
      )}
    </div>
  );
}

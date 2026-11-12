"use client";

import { useActionState } from "react";
import { saveRelayConfigAction, saveStudioConfigAction } from "@/app/(admin)/admin/(panel)/radio/studio/ajustes/actions";
import type { FormState } from "@/lib/admin/form";
import { Field, Message } from "@/ui/admin/fields";

export function RelaySettingsForm({ initial }: { initial: { name: string; url: string; autodj: boolean } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRelayConfigAction, null);
  const v = (k: string, fallback: string) => String(state?.values?.[k] ?? fallback);
  const e = (k: string) => state?.errors?.[k];
  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid max-w-[60ch] gap-4" noValidate>
      <Field label="Nombre" name="relayName" errors={e("name")}>
        <input id="relayName" name="relayName" className="input" defaultValue={v("relayName", initial.name)} />
      </Field>
      <Field label="Dirección de la señal" name="relayUrl" errors={e("url")} hint="La dirección del stream (https://… o http://…). Vacía = sin señal externa.">
        <input id="relayUrl" name="relayUrl" type="url" className="input" defaultValue={v("relayUrl", initial.url)} placeholder="https://myradio24.org/tisradio" />
      </Field>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="relayAutodj" className="mt-1" defaultChecked={state?.values ? state.values.relayAutodj === "on" : initial.autodj} />
        <span>
          Usar la señal como AutoDJ (suena en lugar de la música de la biblioteca)
          <span className="mono muted block">Mientras esté marcada suena solo la señal, y las listas de música normales quedan pausadas (los jingles siguen). Cuando tengas suficiente música, desmárcala y guarda: las listas se vuelven a encender. Si hay una transmisión en vivo, el DJ manda. Requiere la clave API de arriba.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Guardar señal
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function StudioSettingsForm({ initial }: { initial: { baseUrl: string; stationId: string; hasKey: boolean } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStudioConfigAction, null);
  const v = (k: string, fallback: string) => String(state?.values?.[k] ?? fallback);
  const e = (k: string) => state?.errors?.[k];

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid max-w-[60ch] gap-4" noValidate>
      <Field label="Dirección de AzuraCast *" name="baseUrl" errors={e("baseUrl")} hint="Solo https. Ejemplo: https://radio.stereoface.online">
        <input id="baseUrl" name="baseUrl" type="url" className="input" required defaultValue={v("baseUrl", initial.baseUrl)} />
      </Field>
      <Field label="Estación *" name="stationId" errors={e("stationId")} hint="Nombre corto de la estación, por ejemplo stereo_face.">
        <input id="stationId" name="stationId" className="input" required defaultValue={v("stationId", initial.stationId)} />
      </Field>
      <Field
        label={initial.hasKey ? "Clave API (ya hay una guardada)" : "Clave API *"}
        name="apiKey"
        errors={e("apiKey")}
        hint="Se crea en AzuraCast: Mi cuenta, Claves API. Se guarda solo en el servidor y no se vuelve a mostrar. Déjala vacía para conservar la actual."
      >
        <input id="apiKey" name="apiKey" type="password" className="input" autoComplete="off" placeholder={initial.hasKey ? "•••••••• (guardada)" : ""} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Guardar
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

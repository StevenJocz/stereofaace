"use client";

import { useActionState } from "react";
import { saveAdsAction } from "@/app/(admin)/admin/(panel)/ajustes/publicidad/actions";
import type { FormState } from "@/lib/admin/form";
import type { AdsConfig } from "@/modules/settings/ads";
import { Field, Message } from "@/ui/admin/fields";

export function AdsSettingsForm({ initial, adsTxtUrl }: { initial: AdsConfig; adsTxtUrl: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAdsAction, null);
  const v = (k: string, fallback: string) => String(state?.values?.[k] ?? fallback);
  const e = (k: string) => state?.errors?.[k];
  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid max-w-[60ch] gap-4" noValidate>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="enabled" className="mt-1" defaultChecked={state?.values ? state.values.enabled === "on" : initial.enabled} />
        <span>
          Mostrar publicidad en el sitio
          <span className="mono muted block">Activa el aviso de cookies y los espacios publicitarios.</span>
        </span>
      </label>
      <Field label="ID de editor de AdSense" name="publisherId" errors={e("publisherId")} hint="Empieza por ca-pub- y tiene 16 números. Lo ves en AdSense, Cuenta, Información de la cuenta.">
        <input id="publisherId" name="publisherId" className="input" defaultValue={v("publisherId", initial.publisherId)} placeholder="ca-pub-1234567890123456" />
      </Field>
      <Field label="Bloque de la portada" name="slotHome" errors={e("slotHome")} hint="Número del bloque de anuncios (data-ad-slot) que va entre las secciones de la portada. Vacío = sin anuncio ahí.">
        <input id="slotHome" name="slotHome" className="input" inputMode="numeric" defaultValue={v("slotHome", initial.slotHome)} placeholder="1234567890" />
      </Field>
      <Field label="Bloque de las notas" name="slotArticle" errors={e("slotArticle")} hint="Número del bloque que va al final de cada nota. Vacío = sin anuncio ahí.">
        <input id="slotArticle" name="slotArticle" className="input" inputMode="numeric" defaultValue={v("slotArticle", initial.slotArticle)} placeholder="1234567890" />
      </Field>
      <p className="mono muted text-[0.74rem]">
        El archivo <a href={adsTxtUrl} target="_blank" rel="noopener noreferrer" className="underline">{adsTxtUrl}</a> se genera solo con el ID de editor cuando la publicidad está activa.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Guardar
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

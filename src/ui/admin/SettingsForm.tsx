"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/(admin)/admin/(panel)/ajustes/actions";
import type { FormState } from "@/lib/admin/form";
import type { SiteSettings } from "@/modules/settings/site-validators";
import { Field, Message } from "./fields";

const SOCIAL: [keyof SiteSettings["social"], string][] = [
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["spotify", "Spotify"],
  ["soundcloud", "SoundCloud"],
  ["x", "X"],
];

/** Textos del sitio editables: nombre, descripción, redes, newsletter y pie. */
export function SettingsForm({ initial, canSave }: { initial: SiteSettings; canSave: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, null);
  const v = (k: string, fallback: string) => String(state?.values?.[k] ?? fallback);
  const e = (k: string) => state?.errors?.[k];

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-10" noValidate>
      <fieldset className="grid gap-4 md:grid-cols-2" disabled={!canSave}>
        <legend className="display t-s mb-3">Sitio</legend>
        <Field label="Nombre *" name="site_name" errors={e("site.name")}>
          <input id="site_name" name="site_name" className="input" required maxLength={60} defaultValue={v("site_name", initial.site.name)} />
        </Field>
        <Field label="Bajada" name="site_tagline" errors={e("site.tagline")} hint="Se usa en el título del navegador: «Nombre — bajada».">
          <input id="site_tagline" name="site_tagline" className="input" maxLength={120} defaultValue={v("site_tagline", initial.site.tagline)} />
        </Field>
        <Field label="Descripción (SEO por defecto)" name="site_description" errors={e("site.description")} className="md:col-span-2" hint="Hasta 300 caracteres. La ven los buscadores y las redes.">
          <textarea id="site_description" name="site_description" className="input" maxLength={300} defaultValue={v("site_description", initial.site.description)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2" disabled={!canSave}>
        <legend className="display t-s mb-3">Newsletter</legend>
        <Field label="Título *" name="newsletter_title" errors={e("newsletter.title")}>
          <input id="newsletter_title" name="newsletter_title" className="input" required maxLength={60} defaultValue={v("newsletter_title", initial.newsletter.title)} />
        </Field>
        <Field label="Texto" name="newsletter_text" errors={e("newsletter.text")}>
          <input id="newsletter_text" name="newsletter_text" className="input" maxLength={160} defaultValue={v("newsletter_text", initial.newsletter.text)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4" disabled={!canSave}>
        <legend className="display t-s mb-3">Pie de página</legend>
        <Field label="Texto del pie" name="footer_text" errors={e("footer.text")}>
          <textarea id="footer_text" name="footer_text" className="input" maxLength={300} defaultValue={v("footer_text", initial.footer.text)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2" disabled={!canSave}>
        <legend className="display t-s mb-3">Redes sociales</legend>
        <p className="text-muted md:col-span-2">Solo enlaces https. Las que dejes vacías no se muestran en la web.</p>
        {SOCIAL.map(([k, label]) => (
          <Field key={k} label={label} name={`social_${k}`} errors={e(`social.${k}`)}>
            <input id={`social_${k}`} name={`social_${k}`} type="url" className="input" maxLength={2048} defaultValue={v(`social_${k}`, initial.social[k] ?? "")} />
          </Field>
        ))}
      </fieldset>

      {canSave && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-accent" disabled={pending}>
            Guardar ajustes
          </button>
          <Message state={state} />
        </div>
      )}
    </form>
  );
}

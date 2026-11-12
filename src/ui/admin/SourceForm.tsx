"use client";

import { useActionState } from "react";
import { saveSourceAction } from "@/app/(admin)/admin/(panel)/fuentes/actions";
import type { FormState } from "@/lib/admin/form";
import { KIND_LABEL, PUBLISH_LABEL, RIGHTS_LABEL } from "./options";
import { Field, Message } from "./fields";

export type SourceFormValues = {
  id?: string;
  name?: string;
  kind?: string;
  url?: string;
  intervalMinutes?: number;
  defaultCategoryId?: string | null;
  rightsPolicy?: string;
  publishPolicy?: string;
  dailyLimit?: number;
  legalNotes?: string | null;
};

/** Alta o edición del registro de una fuente. No ejecuta ninguna ingesta. */
export function SourceForm({ initial, categories }: { initial: SourceFormValues; categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSourceAction, null);
  const v = (k: string, fallback?: string | number | null) => String(state?.values?.[k] ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Nombre *" name="name" errors={e("name")}>
        <input id="name" name="name" className="input" required minLength={2} maxLength={120} defaultValue={v("name", initial.name)} />
      </Field>
      <Field label="Tipo *" name="kind" errors={e("kind")}>
        <select id="kind" name="kind" className="input" defaultValue={v("kind", initial.kind ?? "rss")}>
          {Object.entries(KIND_LABEL).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="URL pública *" name="url" errors={e("url")} hint="Debe ser una dirección pública (no localhost ni redes internas). Si cambia, hay que verificar de nuevo los términos." className="md:col-span-2">
        <input id="url" name="url" type="url" className="input" required maxLength={2048} defaultValue={v("url", initial.url)} />
      </Field>
      <Field label="Cada cuántos minutos (15–1440)" name="intervalMinutes" errors={e("intervalMinutes")}>
        <input id="intervalMinutes" name="intervalMinutes" type="number" min={15} max={1440} className="input" defaultValue={v("intervalMinutes", initial.intervalMinutes ?? 60)} />
      </Field>
      <Field label="Límite diario de elementos (1–500)" name="dailyLimit" errors={e("dailyLimit")}>
        <input id="dailyLimit" name="dailyLimit" type="number" min={1} max={500} className="input" defaultValue={v("dailyLimit", initial.dailyLimit ?? 20)} />
      </Field>
      <Field label="Política de derechos" name="rightsPolicy" errors={e("rightsPolicy")}>
        <select id="rightsPolicy" name="rightsPolicy" className="input" defaultValue={v("rightsPolicy", initial.rightsPolicy ?? "metadata_only")}>
          {Object.entries(RIGHTS_LABEL).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Política de publicación" name="publishPolicy" errors={e("publishPolicy")}>
        <select id="publishPolicy" name="publishPolicy" className="input" defaultValue={v("publishPolicy", initial.publishPolicy ?? "always_review")}>
          {Object.entries(PUBLISH_LABEL).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Categoría por defecto" name="defaultCategoryId" errors={e("defaultCategoryId")}>
        <select id="defaultCategoryId" name="defaultCategoryId" className="input" defaultValue={v("defaultCategoryId", initial.defaultCategoryId)}>
          <option value="">Ninguna</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notas legales" name="legalNotes" errors={e("legalNotes")} hint="Qué dicen los términos, quién autorizó, enlace a la licencia…" className="md:col-span-2">
        <textarea id="legalNotes" name="legalNotes" className="input" maxLength={4000} defaultValue={v("legalNotes", initial.legalNotes)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {initial.id ? "Guardar cambios" : "Registrar fuente"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

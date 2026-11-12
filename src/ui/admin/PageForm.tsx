"use client";

import { useActionState, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { savePageAction } from "@/app/(admin)/admin/(panel)/paginas/actions";
import type { FormState } from "@/lib/admin/form";
import { TiptapEditor, type EditorValue } from "./TiptapEditor";
import { Field, Message } from "./fields";

export type PageFormValues = {
  id?: string;
  title?: string;
  slug?: string;
  bodyJson?: JSONContent | null;
  bodyHtml?: string | null;
  seoTitle?: string;
  seoDescription?: string;
};

/** Crear o editar una página fija con el mismo editor que los artículos. */
export function PageForm({ initial }: { initial: PageFormValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePageAction, null);
  const [body, setBody] = useState<EditorValue>({
    json: initial.bodyJson ?? { type: "doc", content: [] },
    html: initial.bodyHtml ?? "",
  });
  const v = (k: string, fallback?: string) => String(state?.values?.[k] ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];

  return (
    <form action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="bodyJson" value={JSON.stringify(body.json)} />
      <input type="hidden" name="bodyHtml" value={body.html} />

      <Field label="Título *" name="title" errors={e("title")}>
        <input id="title" name="title" className="input" required maxLength={160} defaultValue={v("title", initial.title)} />
      </Field>
      <Field label="Identificador (slug)" name="slug" errors={e("slug")} hint="La página se publica en /pagina/<slug>. Se genera a partir del título.">
        <input id="slug" name="slug" className="input" maxLength={120} defaultValue={v("slug", initial.slug)} />
      </Field>
      <Field label="Título SEO" name="seoTitle" errors={e("seo.title")} hint="Hasta 70 caracteres.">
        <input id="seoTitle" name="seoTitle" className="input" maxLength={70} defaultValue={v("seoTitle", initial.seoTitle)} />
      </Field>
      <Field label="Descripción SEO" name="seoDescription" errors={e("seo.description")} hint="Hasta 200 caracteres.">
        <input id="seoDescription" name="seoDescription" className="input" maxLength={200} defaultValue={v("seoDescription", initial.seoDescription)} />
      </Field>

      <div className="md:col-span-2">
        <p className="mono mb-2 text-muted">Contenido</p>
        <TiptapEditor initialJson={initial.bodyJson} initialHtml={initial.bodyHtml} onChange={setBody} />
        {e("bodyHtml") && <p role="alert" className="mono mt-1 text-[#ff8a8a]">{e("bodyHtml")}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {initial.id ? "Guardar cambios" : "Crear página"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

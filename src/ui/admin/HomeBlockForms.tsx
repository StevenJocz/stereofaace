"use client";

import { useActionState, useState } from "react";
import {
  activeBlockAction,
  moveBlockAction,
  removeBlockAction,
  saveBlockAction,
} from "@/app/(admin)/admin/(panel)/portada/actions";
import type { FormState } from "@/lib/admin/form";
import { splitHeroTitle } from "@/ui/hero-copy";
import { ConfirmDelete } from "./ConfirmDelete";
import { RowAction } from "./RowAction";
import { Field, Message } from "./fields";

export type ArticleOption = { id: string; title: string };
export type BlockView = {
  id: string;
  kind: "hero" | "feature";
  position: number;
  active: boolean;
  articleId: string;
  articleTitle: string;
  problem: "unpublished" | "deleted" | null;
  config: {
    accentFrom?: number;
    phrase?: string;
    place?: string;
    cta?: string;
    meta?: string;
    path?: string[];
    figure?: boolean;
  };
};

/** Alta o edición de un bloque. En el hero muestra además los datos de presentación del slide. */
export function BlockForm({
  kind,
  articles,
  block,
}: {
  kind: "hero" | "feature";
  articles: ArticleOption[];
  block?: BlockView;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBlockAction, null);
  const sent = (k: string) => state?.values?.[k];
  const [articleId, setArticleId] = useState(block?.articleId ?? articles[0]?.id ?? "");
  const options = block && !articles.some((a) => a.id === block.articleId) ? [{ id: block.articleId, title: block.articleTitle }, ...articles] : articles;
  const title = options.find((a) => a.id === articleId)?.title ?? "";
  const lines = splitHeroTitle(title);
  const c = block?.config ?? {};
  const val = (k: string, fallback: string | undefined) => String(sent(k) ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const idp = block?.id ?? `new-${kind}`;

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-4 md:grid-cols-2" noValidate>
      {block && <input type="hidden" name="id" value={block.id} />}
      <input type="hidden" name="kind" value={kind} />

      <Field label="Artículo (solo publicados) *" name={`${idp}-articleId`} errors={e("articleId")} className="md:col-span-2">
        <select
          id={`${idp}-articleId`}
          name="articleId"
          className="input"
          value={articleId}
          onChange={(ev) => setArticleId(ev.target.value)}
          required
        >
          {options.length === 0 && <option value="">No hay artículos publicados</option>}
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </Field>

      {kind === "hero" && (
        <>
          <div className="md:col-span-2">
            <p className="mono text-muted">Así se parte el titular (sale del título del artículo)</p>
            <p className="display mt-1 text-[1.1rem]">{lines.length ? lines.join(" / ") : "—"}</p>
          </div>
          <Field label="Color de acento desde la línea" name={`${idp}-accentFrom`} errors={e("config.accentFrom")} hint="Por defecto, solo la última línea.">
            <select id={`${idp}-accentFrom`} name="accentFrom" className="input" defaultValue={val("accentFrom", c.accentFrom === undefined ? "" : String(c.accentFrom))}>
              <option value="">Solo la última</option>
              {lines.map((l, i) => (
                <option key={i} value={i}>
                  {i + 1}. {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Frase editorial" name={`${idp}-phrase`} errors={e("config.phrase")} hint="Hasta 160 caracteres.">
            <input id={`${idp}-phrase`} name="phrase" className="input" maxLength={160} defaultValue={val("phrase", c.phrase)} />
          </Field>
          <Field label="Texto del botón" name={`${idp}-cta`} errors={e("config.cta")} hint="Por defecto: Leer más.">
            <input id={`${idp}-cta`} name="cta" className="input" maxLength={30} defaultValue={val("cta", c.cta)} />
          </Field>
          <Field label="Dato junto al botón" name={`${idp}-meta`} errors={e("config.meta")} hint="Ej.: Cultura · 6 min">
            <input id={`${idp}-meta`} name="meta" className="input" maxLength={60} defaultValue={val("meta", c.meta)} />
          </Field>
          <Field label="Lugar" name={`${idp}-place`} errors={e("config.place")} hint="Separa con « · » para varias líneas. Ej.: StereoFace · Colombia">
            <input id={`${idp}-place`} name="place" className="input" maxLength={80} defaultValue={val("place", c.place)} />
          </Field>
          <fieldset className="md:col-span-2">
            <legend className="mono mb-1 text-muted">Ruta (tres partes; por defecto Música / Cultura / Escena)</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <input key={i} name={`path${i}`} aria-label={`Ruta, parte ${i + 1}`} className="input" maxLength={30} defaultValue={val(`path${i}`, c.path?.[i])} />
              ))}
            </div>
            {e("config.path") && (
              <p role="alert" className="mono mt-1 text-[#ff8a8a]">
                Completa las tres partes o deja las tres vacías.
              </p>
            )}
          </fieldset>
          <label className="flex items-center gap-2 md:col-span-2">
            <input type="checkbox" name="figure" defaultChecked={sent("figure") ? sent("figure") === "on" : !!c.figure} />
            <span>Usar la figura ilustrada en lugar de la imagen del artículo</span>
          </label>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-accent" disabled={pending || options.length === 0}>
          {block ? "Guardar cambios" : "Añadir"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** Una fila de bloque: orden, estado, edición y quitar. */
export function BlockRow({ block, first, last, articles }: { block: BlockView; first: boolean; last: boolean; articles: ArticleOption[] }) {
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mono text-muted">
            #{block.position + 1}{" "}
            {!block.active && <span className="badge badge-idle">Desactivado</span>}{" "}
            {block.problem === "unpublished" && <span className="badge badge-warn">Artículo sin publicar: no se muestra</span>}
            {block.problem === "deleted" && <span className="badge badge-bad">Artículo borrado: no se muestra</span>}
          </p>
          <p className="display-up mt-1 text-[1.1rem]">{block.articleTitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!first && <RowAction action={moveBlockAction} fields={{ id: block.id, direction: "up" }} label="↑" ariaLabel="Subir" />}
          {!last && <RowAction action={moveBlockAction} fields={{ id: block.id, direction: "down" }} label="↓" ariaLabel="Bajar" />}
          <RowAction
            action={activeBlockAction}
            fields={{ id: block.id, active: block.active ? "0" : "1" }}
            label={block.active ? "Desactivar" : "Activar"}
            ariaLabel={block.active ? "Desactivar bloque" : "Activar bloque"}
          />
        </div>
      </div>
      <details className="mt-3">
        <summary className="mono cursor-pointer text-accent-ink">Editar</summary>
        <div className="mt-3">
          <BlockForm kind={block.kind} articles={articles} block={block} />
        </div>
      </details>
      <div className="mt-3">
        <ConfirmDelete id={block.id} action={removeBlockAction} label="Quitar de la portada" />
      </div>
    </li>
  );
}

"use client";

import { useActionState } from "react";
import { deleteTaxonomyAction, saveTaxonomyAction } from "@/app/(admin)/admin/(panel)/taxonomia/actions";
import type { FormState } from "@/lib/admin/form";
import { ConfirmDelete } from "./ConfirmDelete";
import { Field, Message } from "./fields";

export type TaxonomyItem = {
  id?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  position?: number | null;
  family?: string | null;
  usage?: number;
};

const FAMILIES: [string, string][] = [
  ["electronica", "Electrónica"],
  ["indie", "Indie"],
  ["otros", "Otros"],
];

/** Alta o edición de una categoría, etiqueta o género. */
export function TaxonomyForm({
  kind,
  item,
  canSave,
  canDelete,
}: {
  kind: "category" | "tag" | "genre";
  item?: TaxonomyItem;
  canSave: boolean;
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTaxonomyAction, null);
  const sent = (k: string) => state?.values?.[k];
  const v = (k: string, fallback?: string | number | null) => String(sent(k) ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const idp = item?.id ?? `new-${kind}`;

  return (
    <li className="panel p-4">
      <form key={state?.nonce ?? "init"} action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" noValidate>
        <input type="hidden" name="kind" value={kind} />
        {item?.id && <input type="hidden" name="id" value={item.id} />}
        <Field label="Nombre *" name={`${idp}-name`} errors={e("name")}>
          <input id={`${idp}-name`} name="name" className="input" required maxLength={80} defaultValue={v("name", item?.name)} disabled={!canSave} />
        </Field>
        <Field label="Identificador (slug)" name={`${idp}-slug`} errors={e("slug")}>
          <input id={`${idp}-slug`} name="slug" className="input" maxLength={120} placeholder="Automático" defaultValue={v("slug", item?.slug)} disabled={!canSave} />
        </Field>
        <div className="flex items-end gap-2">
          {canSave && (
            <button type="submit" className="btn !px-4 !py-2" disabled={pending}>
              {item?.id ? "Guardar" : "Añadir"}
            </button>
          )}
        </div>
        {kind === "category" && (
          <>
            <Field label="Descripción" name={`${idp}-description`} errors={e("description")}>
              <input id={`${idp}-description`} name="description" className="input" maxLength={300} defaultValue={v("description", item?.description)} disabled={!canSave} />
            </Field>
            <Field label="Color (#RRGGBB)" name={`${idp}-color`} errors={e("color")}>
              <input id={`${idp}-color`} name="color" className="input" maxLength={7} placeholder="#c6ff00" defaultValue={v("color", item?.color)} disabled={!canSave} />
            </Field>
            <Field label="Orden" name={`${idp}-position`} errors={e("position")} hint="Menor primero (define el ticker).">
              <input id={`${idp}-position`} name="position" type="number" min={0} max={999} className="input" defaultValue={v("position", item?.position)} disabled={!canSave} />
            </Field>
          </>
        )}
        {kind === "genre" && (
          <Field label="Familia" name={`${idp}-family`} errors={e("family")}>
            <select id={`${idp}-family`} name="family" className="input" defaultValue={v("family", item?.family ?? "otros")} disabled={!canSave}>
              {FAMILIES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="md:col-span-3">
          <Message state={state} />
        </div>
      </form>
      {item?.id && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="mono text-muted">{item.usage ? `En uso en ${item.usage}` : "Sin uso"}</span>
          {canDelete && !item.usage && <ConfirmDelete id={item.id} action={deleteTaxonomyAction} fields={{ kind }} />}
        </div>
      )}
    </li>
  );
}

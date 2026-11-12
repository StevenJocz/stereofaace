"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { deleteMediaAction, updateMediaAction } from "@/app/(admin)/admin/(panel)/medios/actions";
import type { FormState } from "@/lib/admin/form";
import { ConfirmDelete } from "./ConfirmDelete";
import { MediaUpload } from "./MediaUpload";
import { Message } from "./fields";

export type LibraryItem = {
  id: string;
  url: string;
  alt: string;
  credit: string;
  license: string;
  bytes: number;
  usedBy: number;
};

function ItemCard({ item, canEdit, canDelete }: { item: LibraryItem; canEdit: boolean; canDelete: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateMediaAction, null);
  return (
    <li className="panel flex flex-col gap-3 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- archivo propio servido por /media */}
      <img src={`/media/${item.url.split("/media/")[1]}`} alt={item.alt} className="aspect-[4/3] w-full rounded-[6px] object-cover" />
      <p className="mono text-muted">
        {Math.round(item.bytes / 1024)} KB · {item.usedBy === 0 ? "sin uso" : `en uso en ${item.usedBy}`}
      </p>
      {canEdit ? (
        <form key={state?.nonce ?? "init"} action={action} className="grid gap-2">
          <input type="hidden" name="id" value={item.id} />
          <label className="sr-only" htmlFor={`alt-${item.id}`}>Texto alternativo</label>
          <input id={`alt-${item.id}`} name="alt" defaultValue={item.alt} className="input" maxLength={200} required placeholder="Texto alternativo" />
          <label className="sr-only" htmlFor={`credit-${item.id}`}>Crédito</label>
          <input id={`credit-${item.id}`} name="credit" defaultValue={item.credit} className="input" maxLength={200} required placeholder="Crédito" />
          <label className="sr-only" htmlFor={`license-${item.id}`}>Licencia</label>
          <input id={`license-${item.id}`} name="license" defaultValue={item.license} className="input" maxLength={200} required placeholder="Licencia" />
          <button type="submit" className="btn !px-4 !py-2 w-fit" disabled={pending}>
            Guardar
          </button>
          <Message state={state} />
        </form>
      ) : (
        <p className="text-muted">{item.alt}</p>
      )}
      {canDelete && item.usedBy === 0 && <ConfirmDelete id={item.id} action={deleteMediaAction} />}
    </li>
  );
}

/** Rejilla de la biblioteca con subida, edición de metadatos y borrado. */
export function MediaLibrary({
  items,
  canCreate,
  canEdit,
  canDelete,
}: {
  items: LibraryItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  return (
    <>
      {canCreate && (
        <div className="mt-6 max-w-xl">
          <MediaUpload onUploaded={() => router.refresh()} label="Subir imagen nueva" />
        </div>
      )}
      {items.length === 0 ? (
        <p className="mt-8 text-muted">No hay imágenes todavía.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} canEdit={canEdit} canDelete={canDelete} />
          ))}
        </ul>
      )}
    </>
  );
}

"use client";

import { useActionState } from "react";
import { saveReleaseAction } from "@/app/(admin)/admin/(panel)/lanzamientos/actions";
import type { FormState } from "@/lib/admin/form";
import { SCENES, TONES } from "@/modules/media/cover-art";
import { ArtistPicker } from "./ArtistPicker";
import { MediaPicker } from "./MediaPicker";
import { RELEASE_KIND_OPTIONS } from "./options";
import { Field, Message } from "./fields";

export type ReleaseFormValues = {
  id?: string;
  title?: string;
  slug?: string;
  kind?: string;
  releasedAt?: string;
  label?: string;
  artistIds?: string[];
  cover?: { id: string; url: string } | null;
  coverArt?: { scene: string; tone: string; seed: number } | null;
  embedUrl?: string;
  status?: string;
  canPublish: boolean;
};

/** Crear o editar un lanzamiento. */
export function ReleaseForm({ initial, artists }: { initial: ReleaseFormValues; artists: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveReleaseAction, null);
  const sent = (k: string) => state?.values?.[k];
  const v = (k: string, fallback?: string) => String(sent(k) ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const sentArtists = state?.values ? ([] as string[]).concat(state.values.artistIds ?? []) : (initial.artistIds ?? []);

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Título *" name="title" errors={e("title")}>
        <input id="title" name="title" className="input" required maxLength={160} defaultValue={v("title", initial.title)} aria-invalid={!!e("title")} />
      </Field>
      <Field label="Identificador (slug)" name="slug" errors={e("slug")} hint="Opcional. Se genera a partir del título.">
        <input id="slug" name="slug" className="input" maxLength={120} defaultValue={v("slug", initial.slug)} />
      </Field>
      <Field label="Tipo *" name="kind" errors={e("kind")}>
        <select id="kind" name="kind" className="input" defaultValue={v("kind", initial.kind ?? "album")}>
          {RELEASE_KIND_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Fecha de lanzamiento *"
        name="releasedAt"
        errors={e("releasedAt")}
        hint="La portada muestra los lanzamientos publicados de los últimos 30 días y los próximos."
      >
        <input id="releasedAt" name="releasedAt" type="date" className="input" required defaultValue={v("releasedAt", initial.releasedAt)} />
      </Field>
      <Field label="Sello" name="label" errors={e("label")}>
        <input id="label" name="label" className="input" maxLength={120} defaultValue={v("label", initial.label)} />
      </Field>
      <Field
        label="Reproductor oficial (https)"
        name="embedUrl"
        errors={e("embedUrl")}
        hint="Solo Spotify, SoundCloud, Bandcamp, YouTube, Apple Music o Mixcloud. Nunca se aloja audio propio."
      >
        <input id="embedUrl" name="embedUrl" type="url" className="input" maxLength={2048} defaultValue={v("embedUrl", initial.embedUrl)} />
      </Field>

      <div className="md:col-span-2">
        <ArtistPicker artists={artists} initial={sentArtists} max={10} label="Artistas * (el orden se respeta en la portada)" />
        {e("artistIds") && (
          <p role="alert" className="mono mt-1 text-[#ff8a8a]">
            Elige al menos un artista.
          </p>
        )}
      </div>

      <div className="md:col-span-2">
        <MediaPicker name="coverId" label="Portada" initial={initial.cover} />
      </div>

      <fieldset className="md:col-span-2">
        <legend className="mono mb-2 text-muted">Ilustración generativa (opcional)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="scene" aria-label="Escena" className="input" defaultValue={v("scene", initial.coverArt?.scene)}>
            <option value="">Sin ilustración</option>
            {SCENES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="tone" aria-label="Tono" className="input" defaultValue={v("tone", initial.coverArt?.tone ?? "acid")}>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input name="seed" type="number" min={0} max={1000000} aria-label="Semilla" className="input" defaultValue={v("seed", String(initial.coverArt?.seed ?? 1))} />
        </div>
      </fieldset>

      <Field label="Estado" name="status" errors={e("status")} hint={initial.canPublish ? undefined : "Tu rol solo puede guardar borradores."}>
        <select id="status" name="status" className="input" defaultValue={v("status", initial.status ?? "draft")} disabled={!initial.canPublish && !initial.id}>
          <option value="draft">Borrador</option>
          {(initial.canPublish || initial.status === "published") && <option value="published">Publicado</option>}
        </select>
      </Field>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {initial.id ? "Guardar cambios" : "Crear lanzamiento"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

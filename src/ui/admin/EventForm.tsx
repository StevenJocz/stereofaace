"use client";

import { useActionState } from "react";
import { saveEventAction } from "@/app/(admin)/admin/(panel)/agenda/actions";
import type { FormState } from "@/lib/admin/form";
import { SCENES, TONES } from "@/modules/media/cover-art";
import { ArtistPicker } from "./ArtistPicker";
import { COUNTRIES } from "./countries";
import { EVENT_KIND_OPTIONS } from "./options";
import { Field, Message } from "./fields";

export type EventFormValues = {
  id?: string;
  name?: string;
  slug?: string;
  kind?: string;
  /** `datetime-local` en hora de Bogotá. */
  startsAt?: string;
  endsAt?: string;
  venue?: string;
  city?: string;
  country?: string;
  description?: string;
  genreId?: string;
  artistIds?: string[];
  ticketUrl?: string;
  coverArt?: { scene: string; tone: string; seed: number } | null;
  status?: string;
  canPublish: boolean;
};

/** Crear o editar un evento de la agenda. */
export function EventForm({
  initial,
  artists,
  genres,
}: {
  initial: EventFormValues;
  artists: { id: string; name: string }[];
  genres: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEventAction, null);
  const sent = (k: string) => state?.values?.[k];
  const v = (k: string, fallback?: string) => String(sent(k) ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const sentArtists = state?.values ? ([] as string[]).concat(state.values.artistIds ?? []) : (initial.artistIds ?? []);
  const country = v("country", initial.country ?? "CO");
  const countries = COUNTRIES.some(([c]) => c === country) ? COUNTRIES : [[country, country] as [string, string], ...COUNTRIES];

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Nombre *" name="name" errors={e("name")}>
        <input id="name" name="name" className="input" required minLength={2} maxLength={160} defaultValue={v("name", initial.name)} aria-invalid={!!e("name")} />
      </Field>
      <Field label="Identificador (slug)" name="slug" errors={e("slug")} hint="Opcional. Se genera a partir del nombre.">
        <input id="slug" name="slug" className="input" maxLength={120} defaultValue={v("slug", initial.slug)} />
      </Field>
      <Field label="Tipo *" name="kind" errors={e("kind")}>
        <select id="kind" name="kind" className="input" defaultValue={v("kind", initial.kind ?? "concierto")}>
          {EVENT_KIND_OPTIONS.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Género" name="genreId" errors={e("genreId")}>
        <select id="genreId" name="genreId" className="input" defaultValue={v("genreId", initial.genreId)}>
          <option value="">Sin género</option>
          {genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Inicio *" name="startsAt" errors={e("startsAt")} hint="Hora de Bogotá (UTC−5).">
        <input id="startsAt" name="startsAt" type="datetime-local" className="input" required defaultValue={v("startsAt", initial.startsAt)} />
      </Field>
      <Field label="Fin" name="endsAt" errors={e("endsAt")} hint="Opcional. No puede ser anterior al inicio.">
        <input id="endsAt" name="endsAt" type="datetime-local" className="input" defaultValue={v("endsAt", initial.endsAt)} />
      </Field>
      <Field label="Lugar / recinto" name="venue" errors={e("venue")}>
        <input id="venue" name="venue" className="input" maxLength={160} defaultValue={v("venue", initial.venue)} />
      </Field>
      <Field label="Ciudad *" name="city" errors={e("city")}>
        <input id="city" name="city" className="input" required maxLength={100} defaultValue={v("city", initial.city)} />
      </Field>
      <Field label="País *" name="country" errors={e("country")}>
        <select id="country" name="country" className="input" defaultValue={country}>
          {countries.map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Enlace oficial de entradas (https)" name="ticketUrl" errors={e("ticketUrl")} hint="Del organizador. StereoFace no vende entradas.">
        <input id="ticketUrl" name="ticketUrl" type="url" className="input" maxLength={2048} defaultValue={v("ticketUrl", initial.ticketUrl)} />
      </Field>
      <Field label="Descripción" name="description" errors={e("description")} className="md:col-span-2">
        <textarea id="description" name="description" className="input" maxLength={8000} defaultValue={v("description", initial.description)} />
      </Field>

      <div className="md:col-span-2">
        <ArtistPicker artists={artists} initial={sentArtists} max={60} label="Cartel (opcional, el orden se respeta)" />
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

      <Field label="Estado" name="status" errors={e("status")} hint={initial.canPublish ? "Solo «Publicado» aparece en la web." : "Tu rol solo puede guardar borradores."}>
        <select id="status" name="status" className="input" defaultValue={v("status", initial.status ?? "draft")} disabled={!initial.canPublish && !initial.id}>
          <option value="draft">Borrador</option>
          {(initial.canPublish || initial.status === "published") && <option value="published">Publicado</option>}
          {(initial.canPublish || initial.status === "cancelled") && <option value="cancelled">Cancelado</option>}
        </select>
      </Field>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {initial.id ? "Guardar cambios" : "Crear evento"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

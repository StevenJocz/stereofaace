"use client";

import { useActionState } from "react";
import { saveArtistAction } from "@/app/(admin)/admin/(panel)/artistas/actions";
import type { FormState } from "@/lib/admin/form";
import { SCENES, TONES } from "@/modules/media/cover-art";
import { MediaPicker } from "./MediaPicker";
import { Field, Message } from "./fields";

export type ArtistFormValues = {
  id?: string;
  name?: string;
  slug?: string;
  bio?: string;
  country?: string;
  genreIds?: string[];
  featured?: boolean;
  photo?: { id: string; url: string } | null;
  coverArt?: { scene: string; tone: string; seed: number } | null;
  links?: Partial<Record<"spotify" | "soundcloud" | "bandcamp" | "youtube" | "instagram" | "web", string>>;
};

const LINKS: [keyof NonNullable<ArtistFormValues["links"]>, string][] = [
  ["spotify", "Spotify"],
  ["soundcloud", "SoundCloud"],
  ["bandcamp", "Bandcamp"],
  ["youtube", "YouTube"],
  ["instagram", "Instagram"],
  ["web", "Sitio web"],
];

/** Crear o editar un artista. */
export function ArtistForm({ initial, genres }: { initial: ArtistFormValues; genres: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveArtistAction, null);
  const sent = (k: string) => state?.values?.[k];
  const v = (k: string, fallback?: string) => String(sent(k) ?? fallback ?? "");
  const e = (k: string) => state?.errors?.[k];
  const chosen = state?.values ? ([] as string[]).concat(state.values.genreIds ?? []) : (initial.genreIds ?? []);
  const featured = state?.values ? state.values.featured === "on" : !!initial.featured;

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Nombre *" name="name" errors={e("name")}>
        <input id="name" name="name" className="input" required maxLength={120} defaultValue={v("name", initial.name)} aria-invalid={!!e("name")} />
      </Field>
      <Field label="Identificador (slug)" name="slug" errors={e("slug")} hint="Opcional. Se genera a partir del nombre.">
        <input id="slug" name="slug" className="input" maxLength={120} defaultValue={v("slug", initial.slug)} />
      </Field>
      <Field label="Biografía" name="bio" errors={e("bio")} className="md:col-span-2">
        <textarea id="bio" name="bio" className="input" maxLength={8000} defaultValue={v("bio", initial.bio)} />
      </Field>
      <Field label="País (ISO, 2 letras)" name="country" errors={e("country")} hint="Ej.: CO, MX, AR">
        <input id="country" name="country" className="input uppercase" maxLength={2} defaultValue={v("country", initial.country)} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2">
        <input type="checkbox" name="featured" defaultChecked={featured} />
        <span>Destacado en la portada (se muestran 4, por orden alfabético)</span>
      </label>

      <fieldset className="md:col-span-2">
        <legend className="mono mb-2 text-muted">Géneros (hasta 8)</legend>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <label key={g.id} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:!border-transparent has-[:checked]:!bg-accent has-[:checked]:!text-[#07080a]" style={{ transform: "none" }}>
              <span style={{ transform: "none" }}>
                <input type="checkbox" name="genreIds" value={g.id} defaultChecked={chosen.includes(g.id)} className="sr-only" />
                {g.name}
              </span>
            </label>
          ))}
        </div>
        {e("genreIds") && <p role="alert" className="mono mt-1 text-[#ff8a8a]">{e("genreIds")}</p>}
      </fieldset>

      <div className="md:col-span-2">
        <MediaPicker name="photoId" label="Foto del artista" initial={initial.photo} />
        <p className="mt-1 text-[0.78rem] text-muted">Si no hay foto se usa la ilustración de abajo.</p>
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

      <fieldset className="md:col-span-2">
        <legend className="mono mb-2 text-muted">Enlaces oficiales (https)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {LINKS.map(([k, label]) => (
            <Field key={k} label={label} name={`link_${k}`} errors={e(`links.${k}`)}>
              <input id={`link_${k}`} name={`link_${k}`} type="url" className="input" maxLength={2048} defaultValue={v(`link_${k}`, initial.links?.[k])} />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {initial.id ? "Guardar cambios" : "Crear artista"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

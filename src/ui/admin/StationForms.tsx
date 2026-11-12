"use client";

import { useActionState, type ReactNode } from "react";
import {
  authorizationAction,
  deleteStationAction,
  saveStationAction,
  toggleEnabledAction,
  type FormState,
} from "@/app/(admin)/admin/(panel)/radio/actions";

export type StationFormValues = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  country?: string;
  genreIds?: string[];
  streamKind?: "hls" | "direct" | "embed";
  streamUrl?: string;
  embedUrl?: string;
  corsEnabled?: boolean;
  imageUrl?: string;
  websiteUrl?: string;
  attributionName?: string;
  attributionUrl?: string;
  attributionNote?: string;
  position?: number;
};

type Genre = { id: string; name: string };

function Field({
  label,
  name,
  errors,
  hint,
  children,
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mono mb-1 block text-muted">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="mt-1 text-[0.78rem] text-muted">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} role="alert" className="mono mt-1 text-[#ff8a8a]">
          {e}
        </p>
      ))}
    </div>
  );
}

function Message({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mono ${state.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
      {state.message}
    </p>
  );
}

/** Crear o editar una emisora. Una emisora nueva nace desactivada y con autorización pendiente. */
export function StationForm({ initial, genres }: { initial: StationFormValues; genres: Genre[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStationAction, null);
  const v = (k: keyof StationFormValues) => {
    const sent = state?.values?.[k as string];
    if (sent !== undefined) return Array.isArray(sent) ? sent : sent;
    const base = initial[k];
    return base === undefined || base === null ? "" : Array.isArray(base) ? base : String(base);
  };
  const sentGenres = state?.values ? ([] as string[]).concat(state.values.genreIds ?? []) : (initial.genreIds ?? []);
  const cors = state?.values ? state.values.corsEnabled === "on" : !!initial.corsEnabled;
  const e = (k: string) => state?.errors?.[k];
  const kind = String(v("streamKind") || "hls");

  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-5 md:grid-cols-2" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Nombre *" name="name" errors={e("name")}>
        <input
          id="name"
          name="name"
          defaultValue={v("name") as string}
          required
          maxLength={120}
          className="input"
          aria-invalid={!!e("name")}
        />
      </Field>
      <Field
        label="Identificador (slug)"
        name="slug"
        errors={e("slug")}
        hint="Opcional. Se genera a partir del nombre."
      >
        <input
          id="slug"
          name="slug"
          defaultValue={v("slug") as string}
          maxLength={120}
          className="input"
          aria-invalid={!!e("slug")}
        />
      </Field>

      <div className="md:col-span-2">
        <Field label="Descripción" name="description" errors={e("description")}>
          <textarea
            id="description"
            name="description"
            defaultValue={v("description") as string}
            maxLength={600}
            className="input"
          />
        </Field>
      </div>

      <Field label="País (ISO, 2 letras)" name="country" errors={e("country")} hint="Ej.: CO, US, MX">
        <input
          id="country"
          name="country"
          defaultValue={v("country") as string}
          maxLength={2}
          className="input uppercase"
          aria-invalid={!!e("country")}
        />
      </Field>
      <Field label="Orden" name="position" errors={e("position")}>
        <input
          id="position"
          name="position"
          type="number"
          min={0}
          max={999}
          defaultValue={(v("position") as string) || "0"}
          className="input"
        />
      </Field>

      <fieldset className="md:col-span-2">
        <legend className="mono mb-2 text-muted">Géneros</legend>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <label
              key={g.id}
              className="chip !skew-x-0 cursor-pointer !px-3 !py-1.5 has-[:checked]:!border-transparent has-[:checked]:!bg-accent has-[:checked]:!text-[#07080a]"
              style={{ transform: "none" }}
            >
              <span style={{ transform: "none" }}>
                <input
                  type="checkbox"
                  name="genreIds"
                  value={g.id}
                  defaultChecked={sentGenres.includes(g.id)}
                  className="sr-only"
                />
                {g.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="panel md:col-span-2 grid gap-5 p-5 md:grid-cols-2">
        <p className="mono md:col-span-2 text-accent-ink">Señal</p>
        <Field label="Tipo de señal *" name="streamKind" errors={e("streamKind")}>
          <select id="streamKind" name="streamKind" defaultValue={kind} className="input">
            <option value="hls">HLS (.m3u8)</option>
            <option value="direct">Flujo directo (MP3/AAC, Icecast/Shoutcast)</option>
            <option value="embed">Reproductor oficial incrustado</option>
          </select>
        </Field>
        <label className="mt-6 flex items-start gap-3">
          <input type="checkbox" name="corsEnabled" defaultChecked={cors} className="mt-1 size-4 accent-[#c6ff00]" />
          <span>
            <span className="block">El origen permite CORS</span>
            <span className="text-[0.78rem] text-muted">
              Activa el visualizador con datos reales para flujos directos. Si no estás seguro, déjalo apagado: el
              reproductor lo comprueba al sonar y, si no recibe datos, dice que no está disponible.
            </span>
          </span>
        </label>
        <div className="md:col-span-2">
          <Field
            label="URL de la señal (https)"
            name="streamUrl"
            errors={e("streamUrl")}
            hint="Debe ser https público. Solo se guarda el enlace: el navegador se conecta directamente al origen."
          >
            <input
              id="streamUrl"
              name="streamUrl"
              type="url"
              defaultValue={v("streamUrl") as string}
              maxLength={2048}
              className="input"
              aria-invalid={!!e("streamUrl")}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field
            label="URL del reproductor oficial (solo tipo «incrustado»)"
            name="embedUrl"
            errors={e("embedUrl")}
            hint="Solo proveedores permitidos; otros hosts deben añadirse en RADIO_EMBED_HOSTS."
          >
            <input
              id="embedUrl"
              name="embedUrl"
              type="url"
              defaultValue={v("embedUrl") as string}
              maxLength={2048}
              className="input"
              aria-invalid={!!e("embedUrl")}
            />
          </Field>
        </div>
      </div>

      <div className="panel md:col-span-2 grid gap-5 p-5 md:grid-cols-2">
        <p className="mono md:col-span-2 text-accent-ink">Atribución (siempre visible junto al reproductor)</p>
        <Field label="Nombre de la emisora original *" name="attributionName" errors={e("attributionName")}>
          <input
            id="attributionName"
            name="attributionName"
            defaultValue={v("attributionName") as string}
            required
            maxLength={120}
            className="input"
            aria-invalid={!!e("attributionName")}
          />
        </Field>
        <Field label="Enlace a la emisora original (https) *" name="attributionUrl" errors={e("attributionUrl")}>
          <input
            id="attributionUrl"
            name="attributionUrl"
            type="url"
            defaultValue={v("attributionUrl") as string}
            required
            maxLength={2048}
            className="input"
            aria-invalid={!!e("attributionUrl")}
          />
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Nota de atribución"
            name="attributionNote"
            errors={e("attributionNote")}
            hint="Ej.: «Señal y programación © …»."
          >
            <input
              id="attributionNote"
              name="attributionNote"
              defaultValue={v("attributionNote") as string}
              maxLength={300}
              className="input"
            />
          </Field>
        </div>
      </div>

      <Field
        label="Imagen (URL https)"
        name="imageUrl"
        errors={e("imageUrl")}
        hint="Enlace a una imagen que la emisora permita usar. La subida de archivos llega con el módulo de medios."
      >
        <input
          id="imageUrl"
          name="imageUrl"
          type="url"
          defaultValue={v("imageUrl") as string}
          maxLength={2048}
          className="input"
          aria-invalid={!!e("imageUrl")}
        />
      </Field>
      <Field label="Sitio web (https)" name="websiteUrl" errors={e("websiteUrl")}>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={v("websiteUrl") as string}
          maxLength={2048}
          className="input"
          aria-invalid={!!e("websiteUrl")}
        />
      </Field>

      <div className="md:col-span-2 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-accent">
          {pending ? "Guardando…" : initial.id ? "Guardar cambios" : "Crear emisora"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

const AUTH_LABEL: Record<string, string> = {
  pending: "Pendiente",
  granted: "Concedida",
  denied: "Denegada",
  not_required: "No requerida (señal propia o de pruebas)",
};

/** Registro de la autorización de retransmisión (solo quien tiene permiso `station:manage`). */
export function AuthorizationForm({ id, status, notes }: { id: string; status: string; notes?: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(authorizationAction, null);
  return (
    <form key={state?.nonce ?? "init"} action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field label="Estado de la autorización" name="status" errors={state?.errors?.status}>
        <select id="status" name="status" defaultValue={(state?.values?.status as string) ?? status} className="input">
          {Object.entries(AUTH_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Evidencia"
        name="notes"
        errors={state?.errors?.notes}
        hint="Quién autoriza, cuándo y por qué medio (correo, contrato, licencia, reproductor oficial). Obligatoria para conceder."
      >
        <textarea
          id="notes"
          name="notes"
          defaultValue={(state?.values?.notes as string) ?? notes ?? ""}
          maxLength={2000}
          className="input"
        />
      </Field>
      <Field label="Fecha de verificación" name="verifiedAt" errors={state?.errors?.verifiedAt}>
        <input
          id="verifiedAt"
          name="verifiedAt"
          type="date"
          defaultValue={state?.values?.verifiedAt as string}
          className="input"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn">
          {pending ? "Registrando…" : "Registrar autorización"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function EnableForm({ id, enabled, blockedReason }: { id: string; enabled: boolean; blockedReason?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(toggleEnabledAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="enable" value={enabled ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending || (!enabled && !!blockedReason)}
        className={`btn ${enabled ? "" : "btn-accent"}`}
      >
        {enabled ? "Desactivar en el reproductor" : "Activar en el reproductor"}
      </button>
      {!enabled && blockedReason && <p className="mono text-[#ffb020]">{blockedReason}</p>}
      <Message state={state} />
    </form>
  );
}

export function DeleteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteStationAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Escribe BORRAR para confirmar" name="confirm">
        <input id="confirm" name="confirm" autoComplete="off" className="input" />
      </Field>
      <button type="submit" disabled={pending} className="btn !border-[#ff6b6b] !text-[#ff8a8a]">
        Borrar emisora
      </button>
      <Message state={state} />
    </form>
  );
}

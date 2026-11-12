import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import { genres } from "@/modules/taxonomy/schema";
import { recordAudit } from "@/modules/users/audit";
import { radioStationGenres, radioStations, type AuthorizationState, type StreamKind } from "./schema";
import { authorizationInputSchema, stationInputSchema, type AuthorizationInput, type StationInput } from "./validators";

const CLEARED: AuthorizationState[] = ["granted", "not_required"];

/** Lo único que recibe el navegador. Nunca incluye evidencia de autorización ni notas internas. */
export type PublicStation = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  country: string | null;
  genres: string[];
  streamKind: StreamKind;
  streamUrl: string | null;
  embedUrl: string | null;
  corsEnabled: boolean;
  imageUrl: string | null;
  websiteUrl: string | null;
  attributionName: string;
  attributionUrl: string;
  attributionNote: string | null;
  isDemo: boolean;
};

async function genreNames(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ stationId: radioStationGenres.stationId, name: genres.name })
    .from(radioStationGenres)
    .innerJoin(genres, eq(genres.id, radioStationGenres.genreId))
    .where(inArray(radioStationGenres.stationId, ids))
    .orderBy(asc(genres.name));
  for (const r of rows) out.set(r.stationId, [...(out.get(r.stationId) ?? []), r.name]);
  return out;
}

/**
 * Emisoras visibles en el reproductor público: activadas, con autorización vigente y no borradas.
 * La misma condición está protegida por restricciones CHECK en la base de datos.
 */
export async function listPublicStations(db: Db): Promise<PublicStation[]> {
  const rows = await db
    .select()
    .from(radioStations)
    .where(
      and(
        eq(radioStations.enabled, true),
        isNull(radioStations.deletedAt),
        inArray(radioStations.authorizationStatus, CLEARED),
      ),
    )
    .orderBy(asc(radioStations.position), asc(radioStations.name));
  const g = await genreNames(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    country: r.country,
    genres: g.get(r.id) ?? [],
    streamKind: r.streamKind,
    streamUrl: r.streamKind === "embed" ? null : r.streamUrl,
    embedUrl: r.streamKind === "embed" ? r.embedUrl : null,
    corsEnabled: r.corsEnabled,
    imageUrl: r.imageUrl,
    websiteUrl: r.websiteUrl,
    attributionName: r.attributionName,
    attributionUrl: r.attributionUrl,
    attributionNote: r.attributionNote,
    isDemo: r.isDemo,
  }));
}

/* ───────────── Administración (permisos verificados en el servidor) ───────────── */

export async function listStationsAdmin(db: Db, actor: Actor | null) {
  assertCan(actor, "station:read");
  const rows = await db
    .select()
    .from(radioStations)
    .where(isNull(radioStations.deletedAt))
    .orderBy(asc(radioStations.position), asc(radioStations.name));
  const g = await genreNames(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, genres: g.get(r.id) ?? [] }));
}

export async function getStationAdmin(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "station:read");
  const [row] = await db
    .select()
    .from(radioStations)
    .where(and(eq(radioStations.id, id), isNull(radioStations.deletedAt)))
    .limit(1);
  if (!row) return null;
  const gl = await db
    .select({ genreId: radioStationGenres.genreId })
    .from(radioStationGenres)
    .where(eq(radioStationGenres.stationId, id));
  return { ...row, genreIds: gl.map((x) => x.genreId) };
}

async function uniqueSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  const root = base || "emisora";
  const taken = await db
    .select({ id: radioStations.id, slug: radioStations.slug })
    .from(radioStations)
    .where(inArray(radioStations.slug, [root, ...Array.from({ length: 20 }, (_, i) => `${root}-${i + 2}`)]));
  const used = new Set(taken.filter((t) => t.id !== exceptId).map((t) => t.slug));
  if (!used.has(root)) return root;
  for (let i = 2; i <= 21; i++) if (!used.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

async function setGenres(db: Db, stationId: string, genreIds: string[]) {
  await db.delete(radioStationGenres).where(eq(radioStationGenres.stationId, stationId));
  if (genreIds.length) await db.insert(radioStationGenres).values(genreIds.map((genreId) => ({ stationId, genreId })));
}

/** Crea una emisora. Siempre nace desactivada y con autorización pendiente, sin importar lo que llegue. */
export async function createStation(db: Db, actor: Actor | null, raw: unknown) {
  assertCan(actor, "station:create");
  const input = stationInputSchema.parse(raw);
  const slug = await uniqueSlug(db, input.slug ?? slugify(input.name));
  const [row] = await db
    .insert(radioStations)
    .values({
      slug,
      name: input.name,
      description: input.description,
      country: input.country,
      streamKind: input.streamKind,
      streamUrl: input.streamUrl,
      embedUrl: input.embedUrl,
      corsEnabled: input.corsEnabled,
      imageUrl: input.imageUrl,
      websiteUrl: input.websiteUrl,
      attributionName: input.attributionName,
      attributionUrl: input.attributionUrl,
      attributionNote: input.attributionNote,
      position: input.position,
      enabled: false,
      authorizationStatus: "pending",
    })
    .returning({ id: radioStations.id, slug: radioStations.slug });
  await setGenres(db, row.id, input.genreIds);
  await recordAudit(db, { userId: actor.id, action: "station.create", entity: "station", entityId: row.id });
  return row;
}

/**
 * Actualiza datos de la emisora. Si cambia la fuente de la señal (URL, tipo o reproductor) y estaba activa,
 * se desactiva: la autorización concedida era para la fuente anterior.
 */
export async function updateStation(db: Db, actor: Actor | null, id: string, raw: unknown) {
  assertCan(actor, "station:update");
  const input: StationInput = stationInputSchema.parse(raw);
  const current = await getStationAdmin(db, actor, id);
  if (!current) throw new DomainError("not_found", "Emisora no encontrada");

  const sourceChanged =
    current.streamKind !== input.streamKind ||
    (current.streamUrl ?? null) !== (input.streamUrl ?? null) ||
    (current.embedUrl ?? null) !== (input.embedUrl ?? null);
  const disable = sourceChanged && current.enabled;

  await db
    .update(radioStations)
    .set({
      name: input.name,
      slug: input.slug ? await uniqueSlug(db, input.slug, id) : current.slug,
      description: input.description ?? null,
      country: input.country ?? null,
      streamKind: input.streamKind,
      streamUrl: input.streamUrl ?? null,
      embedUrl: input.embedUrl ?? null,
      corsEnabled: input.corsEnabled,
      imageUrl: input.imageUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
      attributionName: input.attributionName,
      attributionUrl: input.attributionUrl,
      attributionNote: input.attributionNote ?? null,
      position: input.position,
      ...(disable ? { enabled: false } : {}),
    })
    .where(eq(radioStations.id, id));
  await setGenres(db, id, input.genreIds);
  await recordAudit(db, {
    userId: actor.id,
    action: "station.update",
    entity: "station",
    entityId: id,
    diff: { sourceChanged, autoDisabled: disable },
  });
  return { autoDisabled: disable };
}

/** Registra la decisión sobre la autorización de retransmisión. Quitar la autorización desactiva la emisora. */
export async function setStationAuthorization(db: Db, actor: Actor | null, id: string, raw: unknown) {
  assertCan(actor, "station:manage");
  const input: AuthorizationInput = authorizationInputSchema.parse(raw);
  const current = await getStationAdmin(db, actor, id);
  if (!current) throw new DomainError("not_found", "Emisora no encontrada");
  const cleared = CLEARED.includes(input.status);

  await db
    .update(radioStations)
    .set({
      authorizationStatus: input.status,
      authorizationNotes: input.notes ?? null,
      authorizationVerifiedAt: cleared ? (input.verifiedAt ?? new Date()) : null,
      authorizationVerifiedBy: cleared ? actor.id : null,
      ...(cleared ? {} : { enabled: false }),
    })
    .where(eq(radioStations.id, id));
  await recordAudit(db, {
    userId: actor.id,
    action: "station.authorization",
    entity: "station",
    entityId: id,
    diff: { from: current.authorizationStatus, to: input.status },
  });
}

/** Activa o desactiva la emisora en el reproductor público. Activar exige autorización y una fuente. */
export async function setStationEnabled(db: Db, actor: Actor | null, id: string, enabled: boolean) {
  assertCan(actor, "station:publish");
  const current = await getStationAdmin(db, actor, id);
  if (!current) throw new DomainError("not_found", "Emisora no encontrada");
  if (enabled) {
    if (!CLEARED.includes(current.authorizationStatus))
      throw new DomainError(
        "not_authorized",
        "No se puede activar: falta la autorización de retransmisión o un reproductor oficial integrable.",
      );
    const hasSource = current.streamKind === "embed" ? !!current.embedUrl : !!current.streamUrl;
    if (!hasSource) throw new DomainError("no_source", "No se puede activar: falta la URL de la señal.");
  }
  await db.update(radioStations).set({ enabled }).where(eq(radioStations.id, id));
  await recordAudit(db, {
    userId: actor.id,
    action: enabled ? "station.enable" : "station.disable",
    entity: "station",
    entityId: id,
  });
}

/** Borrado lógico: la emisora desaparece del reproductor y del listado. */
export async function deleteStation(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "station:delete");
  await db
    .update(radioStations)
    .set({ deletedAt: sql`now()`, enabled: false })
    .where(eq(radioStations.id, id));
  await recordAudit(db, { userId: actor.id, action: "station.delete", entity: "station", entityId: id });
}

import { createHmac, randomBytes } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import { radioPrograms, radioSchedule } from "@/modules/schedule/schema";
import { getProgramForDj } from "@/modules/schedule/dj";
import { siteSettings } from "@/modules/settings/schema";
import { users } from "@/modules/users/schema";
import type { AzScheduleItem, AzStreamerBody } from "./azuracast";
import { systemAzuraClient } from "./settings";

const SECRET_KEY = "studio.djsecret";
const STATION_TZ = "America/Bogota";

/** Usuario de DJ derivado del nombre: minúsculas, números, punto, guion y guion bajo; único entre los locutores. */
export async function uniqueDjUsername(db: Db, name: string): Promise<string> {
  const base = (slugify(name, 30).replace(/[^a-z0-9_.-]/g, "") || "dj").padEnd(2, "x");
  for (let n = 0; n < 1000; n++) {
    const candidate = n === 0 ? base : `${base}${n + 1}`;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.djUsername, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new DomainError("dj_username", "No se pudo generar un usuario de DJ libre.");
}

/** Secreto del servidor para derivar las claves de los DJ. Se crea la primera vez y vive en los ajustes. */
async function djSecret(db: Db): Promise<string> {
  const read = async () => {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, SECRET_KEY));
    const v = (row?.value as { secret?: unknown } | undefined)?.secret;
    return typeof v === "string" && v.length >= 32 ? v : null;
  };
  const existing = await read();
  if (existing) return existing;
  await db.insert(siteSettings).values({ key: SECRET_KEY, value: { secret: randomBytes(32).toString("hex") } }).onConflictDoNothing();
  const created = await read();
  if (!created) throw new DomainError("dj_secret", "No se pudo preparar la clave de los DJ.");
  return created;
}

/** Clave del DJ en AzuraCast: la misma cada vez (se deriva), nunca se guarda y nadie la escribe a mano. */
export async function djPassword(db: Db, userId: string): Promise<string> {
  return createHmac("sha256", await djSecret(db)).update(`dj:${userId}`).digest("base64url").slice(0, 32);
}

const hhmm = (t: string) => Number(t.replace(":", ""));

/** Horario del DJ en el formato de AzuraCast, a partir de los programas que tiene asignados. */
export async function scheduleItemsFor(db: Db, djUsername: string): Promise<AzScheduleItem[]> {
  const rows = await db
    .select({ s: radioSchedule })
    .from(radioSchedule)
    .innerJoin(radioPrograms, eq(radioPrograms.id, radioSchedule.programId))
    .where(and(isNull(radioPrograms.deletedAt), eq(radioPrograms.active, true), sql`lower(${radioPrograms.djUsername}) = ${djUsername.toLowerCase()}`));
  return rows.map(({ s }) =>
    s.kind === "weekly"
      ? { start_time: hhmm(s.startTime), end_time: hhmm(s.endTime), start_date: null, end_date: null, days: [s.weekday === 0 ? 7 : (s.weekday ?? 1)], loop_once: false }
      : { start_time: hhmm(s.startTime), end_time: hhmm(s.endTime), start_date: s.date, end_date: s.date, days: [], loop_once: false },
  );
}

export type DjSync = { ok: boolean; warning?: string };

const soft = (e: unknown): DjSync => ({
  ok: false,
  warning: e instanceof DomainError ? e.message : "No se pudo hablar con AzuraCast. Reintenta la sincronización más tarde.",
});

/**
 * Deja la cuenta de DJ de AzuraCast como debe estar: activa y con su horario si la persona es un locutor activo;
 * desactivada en cualquier otro caso. Nunca lanza por fallos de AzuraCast: devuelve un aviso para mostrarlo.
 */
export async function syncDjAccount(db: Db, userId: string, fetchImpl?: typeof fetch): Promise<DjSync> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.djUsername) return { ok: true };
  const wanted = u.role === "locutor" && u.active;
  try {
    const client = await systemAzuraClient(db, fetchImpl);
    const existing = (await client.listStreamers()).find((s) => s.streamer_username.toLowerCase() === u.djUsername!.toLowerCase());
    if (!wanted && !existing) return { ok: true };
    const items = wanted ? await scheduleItemsFor(db, u.djUsername) : [];
    const tz = wanted ? await client.timezone() : null;
    const tzWarning =
      !wanted || tz === STATION_TZ
        ? undefined
        : tz === null
          ? "No pude leer la zona horaria de AzuraCast: confirma que sea America/Bogota para que el horario se aplique bien."
          : `AzuraCast usa la zona ${tz}, no ${STATION_TZ}: el horario se guardó pero puede quedar desfasado.`;
    const body: AzStreamerBody = {
      streamer_username: u.djUsername,
      streamer_password: await djPassword(db, u.id),
      display_name: u.name,
      comments: "Creado por StereoFace. No lo edites aquí: se sincroniza desde el administrador.",
      is_active: wanted,
      enforce_schedule: true,
      schedule_items: items,
    };
    if (existing) await client.updateStreamer(existing.id, body);
    else await client.createStreamer(body);
    return tzWarning ? { ok: true, warning: tzWarning } : { ok: true };
  } catch (e) {
    return soft(e);
  }
}

/** Tras cambiar programas u horarios: vuelve a enviar el horario de todos los DJ. Sin locutores no hace nada. */
export async function syncAllDjAccounts(db: Db, fetchImpl?: typeof fetch): Promise<void> {
  const rows = await db.select({ id: users.id }).from(users).where(isNotNull(users.djUsername)).orderBy(asc(users.name));
  for (const r of rows) await syncDjAccount(db, r.id, fetchImpl);
}

/** Usuario de DJ del locutor activo, o null si esta persona no es locutor. */
export async function djUsernameOf(db: Db, actor: Actor): Promise<string | null> {
  if (actor.role !== "locutor") return null;
  const [u] = await db.select({ dj: users.djUsername, active: users.active }).from(users).where(eq(users.id, actor.id));
  return u?.active && u.dj ? u.dj : null;
}

export type DjCredentials = { user: string; password: string; programName: string; endsAt: string };

/**
 * Credenciales de emisión del locutor, solo dentro de su horario (desde 15 minutos antes de empezar).
 * Fuera de horario no se entrega nada; además AzuraCast rechaza la conexión por su propio horario.
 */
export async function getDjCredentials(db: Db, actor: Actor | null, now: Date = new Date()): Promise<DjCredentials> {
  if (!actor) throw new DomainError("dj_denied", "Inicia sesión para usar el estudio.");
  const dj = await djUsernameOf(db, actor);
  if (!dj) throw new DomainError("dj_denied", "Tu cuenta no está habilitada para emitir.");
  const info = await getProgramForDj(db, actor, dj, now);
  if (!info.scheduled) {
    const next = info.next
      ? ` Tu próximo programa es «${info.next.program.name}» el ${new Date(info.next.startsAt).toLocaleString("es-CO", { timeZone: STATION_TZ, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false })}.`
      : " No tienes programas con horario asignado.";
    throw new DomainError("dj_out_of_schedule", `No es tu horario.${next}`);
  }
  return { user: dj, password: await djPassword(db, actor.id), programName: info.scheduled.program.name, endsAt: info.scheduled.endsAt };
}

import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { radioPrograms, radioSchedule } from "@/modules/schedule/schema";
import { recordAudit } from "@/modules/users/audit";
import type { AzScheduleItem } from "./azuracast";
import { djUsernameOf } from "./dj-accounts";
import { loadAzuraClient, systemAzuraClient } from "./settings";

const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunes primero
const hhmm = (t: string) => Number(t.replace(":", ""));
/** Peso alto: dentro del horario del programa, su música manda sobre la rotación general. */
const PROGRAM_WEIGHT = 25;
const playlistName = (program: string) => `Programa · ${program}`.slice(0, 60);

type SlotRow = typeof radioSchedule.$inferSelect;

/** Horario de AzuraCast a partir de la parrilla del programa: los tramos semanales con la misma hora se unen; los puntuales llevan su fecha. */
export function azItemsFromSlots(slots: Pick<SlotRow, "kind" | "weekday" | "date" | "startTime" | "endTime">[]): AzScheduleItem[] {
  const weekly = new Map<string, AzScheduleItem>();
  const items: AzScheduleItem[] = [];
  for (const s of slots) {
    if (s.kind === "weekly" && s.weekday !== null) {
      const key = `${s.startTime}-${s.endTime}`;
      const day = s.weekday === 0 ? 7 : s.weekday; // ISO: domingo = 7
      const hit = weekly.get(key);
      if (hit) hit.days = [...new Set([...hit.days, day])].sort();
      else {
        const item: AzScheduleItem = { start_time: hhmm(s.startTime), end_time: hhmm(s.endTime), start_date: null, end_date: null, days: [day], loop_once: false };
        weekly.set(key, item);
        items.push(item);
      }
    } else if (s.kind === "once" && s.date) {
      items.push({ start_time: hhmm(s.startTime), end_time: hhmm(s.endTime), start_date: s.date, end_date: s.date, days: [], loop_once: false });
    }
  }
  return items;
}

/** Líneas legibles del horario: «LUN · MIÉ 10:00–12:00» y «2026-12-05 20:00–22:00». */
export function scheduleLines(slots: Pick<SlotRow, "kind" | "weekday" | "date" | "startTime" | "endTime">[]): string[] {
  const weekly = new Map<string, number[]>();
  const once: string[] = [];
  for (const s of slots) {
    if (s.kind === "weekly" && s.weekday !== null) weekly.set(`${s.startTime}–${s.endTime}`, [...(weekly.get(`${s.startTime}–${s.endTime}`) ?? []), s.weekday]);
    else if (s.date) once.push(`${s.date} ${s.startTime}–${s.endTime}`);
  }
  return [...[...weekly].map(([hours, days]) => `${[...new Set(days)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((d) => DAY_SHORT[d]).join(" · ")} ${hours}`), ...once.sort()];
}

export type ProgramMusic = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  /** Líneas del horario del programa (se editan en Programación). */
  schedule: string[];
  playlist: { id: number; name: string; tracks: number; enabled: boolean } | null;
  /** Hay un vínculo, pero la lista ya no existe en AzuraCast. */
  missing: boolean;
};

async function allowedProgram(db: Db, actor: Actor, programId: string) {
  const [p] = await db.select().from(radioPrograms).where(and(eq(radioPrograms.id, programId), isNull(radioPrograms.deletedAt)));
  if (!p) throw new DomainError("program_not_found", "Ese programa ya no existe.");
  if (actor.role === "locutor") {
    const dj = await djUsernameOf(db, actor);
    if (!dj || p.djUsername?.toLowerCase() !== dj.toLowerCase()) throw new DomainError("program_not_yours", "Solo puedes gestionar la música de tus programas.");
  }
  return p;
}

/** Programas con el estado de su música. Un locutor ve solo los suyos; administración, todos. */
export async function listProgramMusic(db: Db, actor: Actor | null, fetchImpl?: typeof fetch): Promise<ProgramMusic[]> {
  assertCan(actor, "studio:update");
  const dj = actor.role === "locutor" ? await djUsernameOf(db, actor) : null;
  const [programs, slots, remote] = await Promise.all([
    db.select().from(radioPrograms).where(isNull(radioPrograms.deletedAt)).orderBy(asc(radioPrograms.name)),
    db.select().from(radioSchedule),
    loadAzuraClient(db, actor, fetchImpl).then((c) => c.listPlaylistsRaw()).catch(() => null),
  ]);
  return programs
    .filter((p) => actor.role !== "locutor" || (dj !== null && p.djUsername?.toLowerCase() === dj.toLowerCase()))
    .map((p) => {
      const pl = p.playlistId !== null ? remote?.find((x) => x.id === p.playlistId) : undefined;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        active: p.active,
        schedule: scheduleLines(slots.filter((s) => s.programId === p.id)),
        playlist: pl ? { id: pl.id, name: pl.name, tracks: pl.num_songs ?? 0, enabled: pl.is_enabled !== false } : null,
        missing: p.playlistId !== null && remote !== null && !pl,
      };
    });
}

/**
 * Liga un programa con una lista de música de AzuraCast. La lista toma el horario de la parrilla del programa
 * (si luego cambia la parrilla, se actualiza sola). `playlistId` = «new» crea una lista nueva para el programa.
 */
export async function linkProgramPlaylist(db: Db, actor: Actor | null, programId: string, playlistId: number | "new", fetchImpl?: typeof fetch): Promise<{ playlistId: number }> {
  assertCan(actor, "studio:update");
  const p = await allowedProgram(db, actor, programId);
  const client = await loadAzuraClient(db, actor, fetchImpl);
  const slots = await db.select().from(radioSchedule).where(eq(radioSchedule.programId, programId));
  const schedule_items = azItemsFromSlots(slots);
  const existing = await client.listPlaylistsRaw();
  let id: number;
  if (playlistId === "new") {
    const name = playlistName(p.name);
    if (existing.some((x) => x.name === name)) throw new DomainError("playlist_exists", `Ya existe una lista llamada «${name}» en AzuraCast. Elígela en la lista de vincular.`);
    await client.createPlaylist({ name, type: "default", source: "songs", order: "shuffle", weight: PROGRAM_WEIGHT, is_enabled: p.active, schedule_items });
    const created = (await client.listPlaylistsRaw()).find((x) => x.name === name);
    if (!created) throw new DomainError("azuracast_error", "AzuraCast no devolvió la lista creada.");
    id = created.id;
  } else {
    const target = existing.find((x) => x.id === playlistId);
    if (!target) throw new DomainError("playlist_not_found", "Esa lista ya no existe.");
    if ((target.source ?? "songs") !== "songs") throw new DomainError("library_playlist", "Esa lista es de señal externa: no se puede ligar a un programa.");
    const [taken] = await db.select({ id: radioPrograms.id }).from(radioPrograms).where(and(eq(radioPrograms.playlistId, playlistId), isNull(radioPrograms.deletedAt)));
    if (taken && taken.id !== programId) throw new DomainError("playlist_taken", "Esa lista ya pertenece a otro programa.");
    await client.updatePlaylist(playlistId, { type: "default", schedule_items, is_enabled: p.active, weight: PROGRAM_WEIGHT });
    id = playlistId;
  }
  await db.update(radioPrograms).set({ playlistId: id }).where(eq(radioPrograms.id, programId));
  await recordAudit(db, { userId: actor.id, action: "program.music.link", entity: "radio_program", entityId: programId, diff: { playlistId: id } });
  return { playlistId: id };
}

/** Suelta el vínculo. La lista y sus canciones se quedan en AzuraCast con el último horario. */
export async function unlinkProgramPlaylist(db: Db, actor: Actor | null, programId: string): Promise<void> {
  assertCan(actor, "studio:update");
  await allowedProgram(db, actor, programId);
  await db.update(radioPrograms).set({ playlistId: null }).where(eq(radioPrograms.id, programId));
  await recordAudit(db, { userId: actor.id, action: "program.music.unlink", entity: "radio_program", entityId: programId });
}

export type ProgramSync = { ok: boolean; warning?: string };

/**
 * Tras cambiar programas o parrilla: reenvía a AzuraCast el horario de cada lista ligada a un programa
 * (y la pausa si el programa se desactivó o se borró). Nunca lanza: devuelve un aviso.
 */
export async function syncProgramPlaylists(db: Db, fetchImpl?: typeof fetch): Promise<ProgramSync> {
  const linked = await db.select().from(radioPrograms).where(isNotNull(radioPrograms.playlistId));
  if (linked.length === 0) return { ok: true };
  try {
    const client = await systemAzuraClient(db, fetchImpl);
    const slots = await db.select().from(radioSchedule);
    for (const p of linked) {
      const mine = slots.filter((s) => s.programId === p.id);
      await client.updatePlaylist(p.playlistId!, { type: "default", schedule_items: azItemsFromSlots(mine), is_enabled: p.active && p.deletedAt === null });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, warning: e instanceof DomainError ? e.message : "No se pudo hablar con AzuraCast." };
  }
}

/** Programa dueño de una lista (para bloquear su edición libre). */
export async function linkedPlaylists(db: Db): Promise<Map<number, { programId: string; name: string }>> {
  const rows = await db.select({ id: radioPrograms.id, name: radioPrograms.name, playlistId: radioPrograms.playlistId }).from(radioPrograms).where(and(isNotNull(radioPrograms.playlistId), isNull(radioPrograms.deletedAt)));
  return new Map(rows.map((r) => [r.playlistId!, { programId: r.id, name: r.name }]));
}

import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import type { AzPlaylistRaw, AzScheduleItem } from "./azuracast";
import { MAX_SONG_BYTES, validateAudioUpload } from "./audio-validation";
import { linkedPlaylists } from "./program-playlists";
import { loadAzuraClient } from "./settings";

/* ───────────── Nombres y rutas seguros ───────────── */

const BAD_CHARS = /[\\/\0<>:"|?*\u0000-\u001f]/;

/** Nombre de una carpeta o archivo: sin separadores, sin «..» y de largo razonable. */
export function safeName(raw: unknown, what = "El nombre"): string {
  const n = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!n || n.length > 100) throw new DomainError("library_name", `${what} debe tener entre 1 y 100 caracteres.`);
  if (n === "." || n === ".." || BAD_CHARS.test(n)) throw new DomainError("library_name", `${what} no puede llevar / \\ : * ? " < > | ni «..».`);
  return n;
}

/** Ruta de una carpeta dentro de la biblioteca ("" = raíz). Nunca sale de la biblioteca. */
export function safeDir(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string" || raw.length > 400) throw new DomainError("library_path", "La ruta de la carpeta no es válida.");
  const parts = raw.split("/").filter((p) => p !== "");
  if (parts.length > 8) throw new DomainError("library_path", "Demasiadas carpetas anidadas.");
  return parts.map((p) => safeName(p, "Cada carpeta")).join("/");
}

const safePath = (raw: unknown) => {
  const parts = safeDir(raw);
  if (!parts) throw new DomainError("library_path", "Falta la ruta.");
  return parts;
};

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/* ───────────── Carpetas y subida ───────────── */

export async function createFolder(db: Db, actor: Actor | null, parent: unknown, name: unknown, fetchImpl?: typeof fetch): Promise<{ path: string }> {
  assertCan(actor, "studio:update");
  const dir = safeDir(parent);
  const n = safeName(name, "El nombre de la carpeta");
  await (await loadAzuraClient(db, actor, fetchImpl)).mkdir(dir, n);
  await recordAudit(db, { userId: actor.id, action: "library.folder", entity: "azuracast", diff: { path: join(dir, n) } });
  return { path: join(dir, n) };
}

/** Sube una canción a una carpeta de AzuraCast. El formato se comprueba por el contenido, no por el nombre. */
export async function uploadSong(db: Db, actor: Actor | null, dir: unknown, file: File, fetchImpl?: typeof fetch): Promise<{ path: string; size: number }> {
  assertCan(actor, "studio:update");
  const folder = safeDir(dir);
  const check = await validateAudioUpload(file, MAX_SONG_BYTES);
  if (!check.ok) throw new DomainError("library_audio", check.message);
  const base = file.name.replace(/\.[^.]+$/, "").replace(BAD_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "cancion";
  const path = join(folder, `${base}.${check.extension}`);
  await (await loadAzuraClient(db, actor, fetchImpl)).uploadFile(path, check.bytes);
  await recordAudit(db, { userId: actor.id, action: "library.upload", entity: "azuracast", diff: { path, bytes: check.bytes.length } });
  return { path, size: check.bytes.length };
}

/* ───────────── Acciones por lote ───────────── */

export const batchSchema = z
  .object({
    action: z.enum(["delete", "move", "playlist"]),
    files: z.array(z.string().max(500)).max(200).default([]),
    dirs: z.array(z.string().max(500)).max(50).default([]),
    /** move: carpeta destino ("" = raíz). */
    target: z.string().max(400).optional(),
    /** playlist: ids de las listas. */
    playlists: z.array(z.number().int().positive()).max(10).optional(),
  })
  .refine((b) => b.files.length + b.dirs.length > 0, { message: "No elegiste nada." });

export async function libraryBatch(db: Db, actor: Actor | null, raw: unknown, fetchImpl?: typeof fetch): Promise<{ affected: number }> {
  assertCan(actor, "studio:update");
  const b = batchSchema.parse(raw);
  const files = b.files.map(safePath);
  const dirs = b.dirs.map(safePath);
  const client = await loadAzuraClient(db, actor, fetchImpl);
  if (b.action === "delete") await client.batch({ do: "delete", files, dirs });
  else if (b.action === "move") {
    const target = safeDir(b.target ?? "");
    // Una carpeta no puede moverse dentro de sí misma ni de sus hijas.
    if (dirs.some((d) => target === d || target.startsWith(`${d}/`))) throw new DomainError("library_path", "No puedes mover una carpeta dentro de sí misma.");
    const parent = (p: string) => p.split("/").slice(0, -1).join("/");
    const origin = parent([...files, ...dirs][0]);
    if ([...files, ...dirs].some((p) => parent(p) !== origin)) throw new DomainError("library_path", "Elige elementos de una sola carpeta para moverlos.");
    await client.batch({ do: "move", files, dirs, currentDirectory: origin, directory: target });
  } else {
    if (!b.playlists?.length) throw new DomainError("library_playlist", "Elige al menos una lista.");
    await client.batch({ do: "playlist", files, dirs, playlists: b.playlists });
  }
  await recordAudit(db, { userId: actor.id, action: `library.${b.action}`, entity: "azuracast", diff: { files: files.length, dirs: dirs.length } });
  return { affected: files.length + dirs.length };
}

/* ───────────── Listas del AutoDJ y su programación ───────────── */

const DAYS = [1, 2, 3, 4, 5, 6, 7]; // ISO: 1 = lunes … 7 = domingo
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toInt = (t: string) => Number(t.replace(":", ""));
const toTime = (n: number) => `${String(Math.floor(n / 100)).padStart(2, "0")}:${String(n % 100).padStart(2, "0")}`;

export type ScheduleRow = { days: number[]; start: string; end: string };
export type AutoDjPlaylist = {
  id: number;
  name: string;
  /** Solo las listas de canciones libres se editan aquí; las de señal externa las maneja la pestaña «Señal». */
  editable: boolean;
  /** Si la lista pertenece a un programa, su horario sale de la parrilla de ese programa. */
  program: string | null;
  enabled: boolean;
  order: "shuffle" | "random" | "sequential";
  weight: number;
  tracks: number;
  schedule: ScheduleRow[];
};

const scheduleRowSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    start: z.string().regex(HHMM, "Hora de inicio no válida (HH:MM)"),
    end: z.string().regex(HHMM, "Hora de fin no válida (HH:MM)"),
  })
  .refine((r) => r.start !== r.end, { message: "El inicio y el fin no pueden ser iguales" });

export const playlistSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Escribe el nombre de la lista").max(60),
  enabled: z.boolean().default(true),
  order: z.enum(["shuffle", "random", "sequential"]).default("shuffle"),
  weight: z.number().int().min(1).max(25).default(3),
  schedule: z.array(scheduleRowSchema).max(14, "Máximo 14 horarios por lista").default([]),
});
export type PlaylistInput = z.input<typeof playlistSchema>;

/** Horario de la interfaz → formato de AzuraCast (HHMM, días ISO; sin días = todos). */
export function toAzSchedule(rows: ScheduleRow[]): AzScheduleItem[] {
  return rows.map((r) => ({
    start_time: toInt(r.start),
    end_time: toInt(r.end),
    start_date: null,
    end_date: null,
    days: r.days.length ? [...new Set(r.days)].sort() : DAYS,
    loop_once: false,
  }));
}

export function fromAzSchedule(items: AzScheduleItem[] | undefined): ScheduleRow[] {
  return (items ?? []).map((i) => ({ days: i.days?.length ? [...i.days].sort() : DAYS, start: toTime(i.start_time), end: toTime(i.end_time) }));
}

const view = (p: AzPlaylistRaw, owner?: { name: string }): AutoDjPlaylist => ({
  id: p.id,
  name: p.name,
  editable: (p.source ?? "songs") === "songs" && !owner,
  program: owner?.name ?? null,
  enabled: p.is_enabled !== false,
  order: p.order === "random" || p.order === "sequential" ? p.order : "shuffle",
  weight: p.weight ?? 3,
  tracks: p.num_songs ?? 0,
  schedule: fromAzSchedule(p.schedule_items),
});

export async function listAutoDjPlaylists(db: Db, actor: Actor | null, fetchImpl?: typeof fetch): Promise<AutoDjPlaylist[]> {
  assertCan(actor, "studio:update");
  const [raw, owners] = await Promise.all([(await loadAzuraClient(db, actor, fetchImpl)).listPlaylistsRaw(), linkedPlaylists(db)]);
  return raw.map((p) => view(p, owners.get(p.id)));
}

/** Crea o actualiza una lista de canciones del AutoDJ con su horario. */
export async function saveAutoDjPlaylist(db: Db, actor: Actor | null, raw: unknown, fetchImpl?: typeof fetch): Promise<{ ok: true }> {
  assertCan(actor, "studio:update");
  const input = playlistSchema.parse(raw);
  const client = await loadAzuraClient(db, actor, fetchImpl);
  const body = {
    name: input.name,
    type: "default",
    source: "songs",
    order: input.order,
    weight: input.weight,
    is_enabled: input.enabled,
    schedule_items: toAzSchedule(input.schedule),
  };
  if (input.id) {
    const current = (await client.listPlaylistsRaw()).find((p) => p.id === input.id);
    if (!current) throw new DomainError("playlist_not_found", "Esa lista ya no existe.");
    if ((current.source ?? "songs") !== "songs") throw new DomainError("library_playlist", "Esa lista es de señal externa: se gestiona en la pestaña Señal.");
    const owner = (await linkedPlaylists(db)).get(input.id);
    if (owner) throw new DomainError("library_playlist", `Esa lista es del programa «${owner.name}»: su horario sale de la Programación.`);
    await client.updatePlaylist(input.id, body);
  } else await client.createPlaylist(body);
  await recordAudit(db, { userId: actor.id, action: input.id ? "autodj.playlist.update" : "autodj.playlist.create", entity: "azuracast", diff: { name: input.name, schedule: input.schedule.length } });
  return { ok: true };
}

export async function deleteAutoDjPlaylist(db: Db, actor: Actor | null, id: unknown, fetchImpl?: typeof fetch): Promise<{ ok: true }> {
  assertCan(actor, "studio:update");
  const pid = z.number().int().positive().parse(id);
  const client = await loadAzuraClient(db, actor, fetchImpl);
  const current = (await client.listPlaylistsRaw()).find((p) => p.id === pid);
  if (!current) throw new DomainError("playlist_not_found", "Esa lista ya no existe.");
  if ((current.source ?? "songs") !== "songs") throw new DomainError("library_playlist", "Esa lista es de señal externa: se gestiona en la pestaña Señal.");
  const owner = (await linkedPlaylists(db)).get(pid);
  if (owner) throw new DomainError("library_playlist", `Esa lista es del programa «${owner.name}»: suéltala del programa antes de eliminarla.`);
  await client.deletePlaylist(pid);
  await recordAudit(db, { userId: actor.id, action: "autodj.playlist.delete", entity: "azuracast", diff: { name: current.name } });
  return { ok: true };
}

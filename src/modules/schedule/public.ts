import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { media } from "@/modules/media/schema";
import { currentOccurrence, occurrencesBetween, type Slot } from "./occurrences";
import { radioPrograms, radioSchedule } from "./schema";

/** Lo único que ve el público de un programa: nunca el usuario del DJ ni ids internos. */
export type PublicProgram = { slug: string; name: string; description: string | null; hosts: string | null; imageUrl: string | null; color: string };

const MAX_RANGE_DAYS = 62;

async function load(db: Db): Promise<{ slots: Slot[]; programs: Map<string, PublicProgram> }> {
  const rows = await db
    .select({ p: radioPrograms, s: radioSchedule, key: media.storageKey })
    .from(radioSchedule)
    .innerJoin(radioPrograms, eq(radioPrograms.id, radioSchedule.programId))
    .leftJoin(media, eq(media.id, radioPrograms.photoId))
    .where(and(isNull(radioPrograms.deletedAt), eq(radioPrograms.active, true)));
  const programs = new Map<string, PublicProgram>();
  const slots: Slot[] = [];
  for (const { p, s, key } of rows) {
    programs.set(p.id, { slug: p.slug, name: p.name, description: p.description, hosts: p.hosts, imageUrl: key ? `/media/${key}` : null, color: p.color });
    slots.push({ id: s.id, programId: p.id, kind: s.kind as "weekly" | "once", weekday: s.weekday, date: s.date, start: s.startTime, end: s.endTime });
  }
  return { slots, programs };
}

export type NowPlaying = {
  program: PublicProgram;
  startsAt: string;
  endsAt: string;
  next: { program: PublicProgram; startsAt: string } | null;
};

/** Programa que suena ahora (por la parrilla), cuándo termina y cuál sigue. `null` si no hay programa en este momento. */
export async function getNowPlaying(db: Db, now: Date = new Date()): Promise<NowPlaying | null> {
  const { slots, programs } = await load(db);
  const cur = currentOccurrence(slots, now);
  if (!cur) return null;
  const program = programs.get(cur.programId);
  if (!program) return null;
  const upcoming = occurrencesBetween(slots, cur.endsAt, new Date(cur.endsAt.getTime() + 14 * 86_400_000)).find((o) => o.startsAt.getTime() >= cur.endsAt.getTime());
  const nextProgram = upcoming ? programs.get(upcoming.programId) : undefined;
  return {
    program,
    startsAt: cur.startsAt.toISOString(),
    endsAt: cur.endsAt.toISOString(),
    next: upcoming && nextProgram ? { program: nextProgram, startsAt: upcoming.startsAt.toISOString() } : null,
  };
}

export async function getSchedule(db: Db, from: Date, to: Date): Promise<{ program: PublicProgram; startsAt: string; endsAt: string }[]> {
  if (!(to.getTime() > from.getTime())) throw new DomainError("bad_range", "El rango de fechas no es válido.");
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new DomainError("range_too_large", `El rango no puede superar ${MAX_RANGE_DAYS} días.`);
  }
  const { slots, programs } = await load(db);
  return occurrencesBetween(slots, from, to).flatMap((o) => {
    const program = programs.get(o.programId);
    return program ? [{ program, startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() }] : [];
  });
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

/** Ficha pública de un programa: lo editorial (nombre, quién lo hace, descripción, imagen) y cuándo sale al aire. */
export type PublicProgramInfo = PublicProgram & {
  /** Tramos semanales (0 = domingo … 6 = sábado), horas locales de Bogotá. */
  weekly: { weekday: number; start: string; end: string }[];
  /** Próximas emisiones (incluye los horarios puntuales), máximo 4. */
  upcoming: { startsAt: string; endsAt: string }[];
  onAir: boolean;
};

async function loadAllPrograms(db: Db, now: Date): Promise<PublicProgramInfo[]> {
  const [programRows, slotRows] = await Promise.all([
    db
      .select({ p: radioPrograms, key: media.storageKey })
      .from(radioPrograms)
      .leftJoin(media, eq(media.id, radioPrograms.photoId))
      .where(and(isNull(radioPrograms.deletedAt), eq(radioPrograms.active, true))),
    db.select().from(radioSchedule),
  ]);
  const ids = new Set(programRows.map((r) => r.p.id));
  const slots: Slot[] = slotRows
    .filter((s) => ids.has(s.programId))
    .map((s) => ({ id: s.id, programId: s.programId, kind: s.kind as "weekly" | "once", weekday: s.weekday, date: s.date, start: s.startTime, end: s.endTime }));
  const occ = occurrencesBetween(slots, new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 14 * 86_400_000));
  const nowMs = now.getTime();
  return programRows.map(({ p, key }) => {
    const mine = occ.filter((o) => o.programId === p.id);
    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      hosts: p.hosts,
      imageUrl: key ? `/media/${key}` : null,
      color: p.color,
      weekly: slots
        .filter((s) => s.programId === p.id && s.kind === "weekly" && s.weekday !== null)
        .map((s) => ({ weekday: s.weekday as number, start: s.start, end: s.end }))
        .sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.start.localeCompare(b.start)),
      upcoming: mine
        .filter((o) => o.endsAt.getTime() > nowMs)
        .slice(0, 4)
        .map((o) => ({ startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() })),
      onAir: mine.some((o) => o.startsAt.getTime() <= nowMs && o.endsAt.getTime() > nowMs),
    };
  });
}

/** Programas activos: primero el que está al aire, luego por la próxima emisión; los que no tienen horario, al final. */
export async function listPublicPrograms(db: Db, now: Date = new Date()): Promise<PublicProgramInfo[]> {
  const all = await loadAllPrograms(db, now);
  const next = (p: PublicProgramInfo) => (p.onAir ? -1 : p.upcoming[0] ? Date.parse(p.upcoming[0].startsAt) : Number.POSITIVE_INFINITY);
  return all.sort((a, b) => next(a) - next(b) || a.name.localeCompare(b.name, "es"));
}

export async function getPublicProgram(db: Db, slug: string, now: Date = new Date()): Promise<PublicProgramInfo | null> {
  return (await loadAllPrograms(db, now)).find((p) => p.slug === slug) ?? null;
}

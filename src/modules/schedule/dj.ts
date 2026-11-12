import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { media } from "@/modules/media/schema";
import { occurrencesBetween, type Slot } from "./occurrences";
import { radioPrograms, radioSchedule } from "./schema";

/** Programa tal como lo ve el DJ en el estudio (incluye todo lo necesario para mostrarlo; sin datos internos). */
export type StudioProgram = { id: string; name: string; description: string | null; imageUrl: string | null; hosts: string | null };

const SOON_MIN = 15; // el programa del DJ cuenta como «el suyo» desde 15 minutos antes de empezar

export type DjProgramInfo = {
  scheduled: { program: StudioProgram; startsAt: string; endsAt: string } | null;
  next: { program: StudioProgram; startsAt: string } | null;
  others: StudioProgram[];
};

/**
 * Qué programa le toca a un DJ ahora: el que cubre este momento o empieza en 15 minutos, su siguiente
 * ocurrencia, y los demás programas activos por si emite fuera de horario.
 */
export async function getProgramForDj(db: Db, actor: Actor | null, djUsername: string, now: Date = new Date()): Promise<DjProgramInfo> {
  assertCan(actor, "station:update");
  const dj = djUsername.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,50}$/.test(dj)) throw new DomainError("bad_dj", "Usuario de DJ no válido.");

  const progRows = await db
    .select({ p: radioPrograms, key: media.storageKey })
    .from(radioPrograms)
    .leftJoin(media, eq(media.id, radioPrograms.photoId))
    .where(and(isNull(radioPrograms.deletedAt), eq(radioPrograms.active, true)));
  const programs = new Map<string, StudioProgram & { dj: string | null }>();
  for (const { p, key } of progRows) {
    programs.set(p.id, { id: p.id, name: p.name, description: p.description, imageUrl: key ? `/media/${key}` : null, hosts: p.hosts, dj: p.djUsername?.toLowerCase() ?? null });
  }
  const slotRows = await db.select().from(radioSchedule);
  const slots: Slot[] = slotRows
    .filter((s) => programs.has(s.programId))
    .map((s) => ({ id: s.id, programId: s.programId, kind: s.kind as "weekly" | "once", weekday: s.weekday, date: s.date, start: s.startTime, end: s.endTime }));

  const strip = (p: StudioProgram): StudioProgram => ({ id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, hosts: p.hosts });
  const mine = (programId: string) => programs.get(programId)?.dj === dj;

  // La parrilla completa decide (un horario puntual de otro programa puede tapar el tramo del DJ).
  const soonMs = now.getTime() + SOON_MIN * 60_000;
  const all = occurrencesBetween(slots, now, new Date(now.getTime() + 14 * 86_400_000)).filter((o) => mine(o.programId));
  const soon = all.find((o) => o.startsAt.getTime() < soonMs && o.endsAt.getTime() > now.getTime());
  const next = all.find((o) => o !== soon && o.startsAt.getTime() > (soon?.startsAt.getTime() ?? now.getTime()));

  const scheduledProgram = soon ? programs.get(soon.programId) : undefined;
  const nextProgram = next ? programs.get(next.programId) : undefined;
  return {
    scheduled: soon && scheduledProgram ? { program: strip(scheduledProgram), startsAt: soon.startsAt.toISOString(), endsAt: soon.endsAt.toISOString() } : null,
    next: next && nextProgram ? { program: strip(nextProgram), startsAt: next.startsAt.toISOString() } : null,
    others: [...programs.values()].filter((p) => p.id !== scheduledProgram?.id).map(strip),
  };
}

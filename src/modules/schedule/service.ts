import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { uniqueSlug } from "@/lib/admin/slug";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { slugify } from "@/lib/slug";
import { media } from "@/modules/media/schema";
import { recordAudit } from "@/modules/users/audit";
import { radioPrograms, radioSchedule } from "./schema";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const programSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Escribe el nombre del programa").max(80),
  description: z.string().trim().max(300, "La descripción admite hasta 300 caracteres").optional(),
  hosts: z.string().trim().max(120).optional(),
  djUsername: z
    .string()
    .trim()
    .regex(/^[a-z0-9_.-]{2,50}$/, "Usuario de DJ no válido (minúsculas, números, punto, guion y guion bajo)")
    .optional(),
  photoId: z.uuid().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido (usa #rrggbb)").optional(),
  active: z.boolean().optional(),
});
export type ProgramInput = z.input<typeof programSchema>;

const slotSchema = z
  .object({
    programId: z.uuid(),
    kind: z.enum(["weekly", "once"]),
    weekday: z.number().int().min(0).max(6).optional(),
    date: z.string().regex(DATE, "Fecha no válida (AAAA-MM-DD)").optional(),
    start: z.string().regex(HHMM, "Hora de inicio no válida (HH:MM)"),
    end: z.string().regex(HHMM, "Hora de fin no válida (HH:MM)"),
  })
  .superRefine((s, ctx) => {
    if (s.start === s.end) ctx.addIssue({ code: "custom", message: "El inicio y el fin no pueden ser iguales", path: ["end"] });
    if (s.kind === "weekly") {
      if (s.weekday === undefined) ctx.addIssue({ code: "custom", message: "Elige el día de la semana", path: ["weekday"] });
      if (s.date !== undefined) ctx.addIssue({ code: "custom", message: "Un tramo semanal no lleva fecha", path: ["date"] });
    } else {
      if (s.date === undefined) ctx.addIssue({ code: "custom", message: "Elige la fecha", path: ["date"] });
      if (s.weekday !== undefined) ctx.addIssue({ code: "custom", message: "Un tramo puntual no lleva día de la semana", path: ["weekday"] });
    }
  });
export type SlotInput = z.input<typeof slotSchema>;

const live = isNull(radioPrograms.deletedAt);

export type ProgramAdminView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  hosts: string | null;
  djUsername: string | null;
  photoId: string | null;
  photoUrl: string | null;
  color: string;
  active: boolean;
  slots: number;
};

export async function listProgramsAdmin(db: Db, actor: Actor | null): Promise<ProgramAdminView[]> {
  assertCan(actor, "station:update");
  const rows = await db
    .select({ p: radioPrograms, key: media.storageKey, slots: sql<number>`(select count(*) from radio_schedule where radio_schedule.program_id = radio_programs.id)`.mapWith(Number) })
    .from(radioPrograms)
    .leftJoin(media, eq(media.id, radioPrograms.photoId))
    .where(live)
    .orderBy(asc(radioPrograms.name));
  return rows.map(({ p, key, slots }) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    hosts: p.hosts,
    djUsername: p.djUsername,
    photoId: p.photoId,
    photoUrl: key ? `/media/${key}` : null,
    color: p.color,
    active: p.active,
    slots,
  }));
}

export async function saveProgram(db: Db, actor: Actor | null, raw: ProgramInput): Promise<{ id: string; slug: string }> {
  assertCan(actor, "station:update");
  const input = programSchema.parse(raw);
  if (input.photoId) {
    const [m] = await db.select({ id: media.id }).from(media).where(eq(media.id, input.photoId));
    if (!m) throw new DomainError("program_bad_photo", "La imagen elegida ya no existe en la biblioteca de medios.");
  }
  const values = {
    name: input.name,
    description: input.description || null,
    hosts: input.hosts || null,
    djUsername: input.djUsername || null,
    photoId: input.photoId ?? null,
    ...(input.color ? { color: input.color } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (input.id) {
    const [row] = await db.update(radioPrograms).set(values).where(and(eq(radioPrograms.id, input.id), live)).returning({ id: radioPrograms.id, slug: radioPrograms.slug });
    if (!row) throw new DomainError("program_not_found", "Ese programa ya no existe.");
    await recordAudit(db, { userId: actor.id, action: "schedule.program.update", entity: "radio_program", entityId: row.id, diff: { fields: Object.keys(values) } });
    return row;
  }
  const slug = await uniqueSlug(db, radioPrograms, slugify(input.name), "programa");
  const [row] = await db.insert(radioPrograms).values({ ...values, slug }).returning({ id: radioPrograms.id, slug: radioPrograms.slug });
  await recordAudit(db, { userId: actor.id, action: "schedule.program.create", entity: "radio_program", entityId: row.id, diff: { name: input.name } });
  return row;
}

/** Borrado lógico: el programa y sus tramos dejan de verse en la parrilla pública y en el administrador. */
export async function deleteProgram(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "station:delete");
  const [row] = await db.update(radioPrograms).set({ deletedAt: new Date() }).where(and(eq(radioPrograms.id, id), live)).returning({ id: radioPrograms.id });
  if (!row) throw new DomainError("program_not_found", "Ese programa ya no existe.");
  await recordAudit(db, { userId: actor.id, action: "schedule.program.delete", entity: "radio_program", entityId: id });
}

export type SlotAdminView = { id: string; programId: string; kind: "weekly" | "once"; weekday: number | null; date: string | null; start: string; end: string };

export async function listSlotsAdmin(db: Db, actor: Actor | null): Promise<SlotAdminView[]> {
  assertCan(actor, "station:update");
  const rows = await db
    .select({ s: radioSchedule })
    .from(radioSchedule)
    .innerJoin(radioPrograms, eq(radioPrograms.id, radioSchedule.programId))
    .where(live)
    .orderBy(asc(radioSchedule.weekday), asc(radioSchedule.date), asc(radioSchedule.startTime));
  return rows.map(({ s }) => ({ id: s.id, programId: s.programId, kind: s.kind as "weekly" | "once", weekday: s.weekday, date: s.date, start: s.startTime, end: s.endTime }));
}

export async function addSlot(db: Db, actor: Actor | null, raw: SlotInput): Promise<{ id: string }> {
  assertCan(actor, "station:update");
  const input = slotSchema.parse(raw);
  const [p] = await db.select({ id: radioPrograms.id }).from(radioPrograms).where(and(eq(radioPrograms.id, input.programId), live));
  if (!p) throw new DomainError("program_not_found", "Ese programa ya no existe.");
  const [row] = await db
    .insert(radioSchedule)
    .values({ programId: input.programId, kind: input.kind, weekday: input.weekday ?? null, date: input.date ?? null, startTime: input.start, endTime: input.end })
    .returning({ id: radioSchedule.id });
  await recordAudit(db, { userId: actor.id, action: "schedule.slot.create", entity: "radio_schedule", entityId: row.id, diff: { programId: input.programId, kind: input.kind } });
  return row;
}

export async function removeSlot(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "station:update");
  const [row] = await db.delete(radioSchedule).where(eq(radioSchedule.id, id)).returning({ id: radioSchedule.id });
  if (!row) throw new DomainError("slot_not_found", "Ese tramo ya no existe.");
  await recordAudit(db, { userId: actor.id, action: "schedule.slot.delete", entity: "radio_schedule", entityId: id });
}

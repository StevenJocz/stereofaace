import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { media } from "@/modules/media/schema";

/** Programas de StereoFace Radio: nombre, imagen, descripción breve y el DJ que los conduce. */
export const radioPrograms = pgTable("radio_programs", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  hosts: text("hosts"),
  /** Usuario del DJ de AzuraCast que conduce el programa (p. ej. dj1). Nunca se expone en la API pública. */
  djUsername: text("dj_username"),
  photoId: uuid("photo_id").references(() => media.id, { onDelete: "set null" }),
  color: text("color").notNull().default("#c6ff00"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Parrilla: tramos semanales recurrentes o puntuales (una fecha concreta). Horas locales de Bogotá. */
export const radioSchedule = pgTable(
  "radio_schedule",
  {
    id: pk(),
    programId: uuid("program_id")
      .notNull()
      .references(() => radioPrograms.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    weekday: integer("weekday"),
    date: date("date", { mode: "string" }),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("radio_schedule_program_idx").on(t.programId)],
);

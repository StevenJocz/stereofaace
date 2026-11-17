import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk } from "@/lib/db/columns";
import { users } from "@/modules/users/schema";

/**
 * Directos de «Cámara en cabina». Solo una sesión activa a la vez (índice único parcial).
 * No se guarda ninguna clave RTMP: se pide a YouTube en cada directo y viaja solo servidor → relay.
 */
export const videoSessions = pgTable(
  "video_sessions",
  {
    id: pk(),
    state: text("state").notNull(),
    /** Verdadero mientras la sesión no ha terminado; el índice único impide dos directos a la vez. */
    active: boolean("active").notNull().default(true),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    broadcastId: text("broadcast_id"),
    streamId: text("stream_id"),
    privacy: text("privacy").notNull().default("unlisted"),
    title: text("title").notNull(),
    /** Motivo del fallo, ya en español y sin datos sensibles. */
    error: text("error"),
    /** Desde cu�ndo est� en el estado actual (para los tiempos de espera). */
    stateAt: timestamp("state_at", { withTimezone: true }).notNull().defaultNow(),
    liveAt: timestamp("live_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Última conciliación con YouTube y el relay (para no consultarlos en cada petición). */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("video_sessions_one_active_idx").on(t.active).where(sql`${t.active}`), index("video_sessions_created_idx").on(t.createdAt)],
);

/** Credenciales temporales y de un solo uso para que el navegador del locutor publique por WebRTC. */
export const videoTickets = pgTable(
  "video_tickets",
  {
    id: pk(),
    /** Solo el hash: el valor en claro viaja una vez al navegador. */
    tokenHash: text("token_hash").notNull().unique(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("video_tickets_session_idx").on(t.sessionId)],
);

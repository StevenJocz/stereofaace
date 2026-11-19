import { bigserial, boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { users } from "@/modules/users/schema";

/** Mensajes del chat público de la radio. `seq` es el cursor que usan los clientes para pedir solo lo nuevo. */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: pk(),
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    /** Identificador anónimo del navegador (no es un dato personal); sirve para silenciar y para marcar «mis mensajes». */
    clientId: text("client_id").notNull(),
    nickname: text("nickname").notNull(),
    /** Chulo de verificado de quien escribió (copia del momento del mensaje). */
    verified: boolean("verified").notNull().default(false),
    body: text("body"),
    /** message = mensaje normal; request = tarjeta de pedido de canción (body = título, artist = artista). */
    kind: text("kind").notNull().default("message"),
    artist: text("artist"),
    /** Comentario corto del pedido (solo en las tarjetas de pedido). */
    note: text("note"),
    /** Clave de un GIF de la bandeja predefinida. */
    gif: text("gif"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_created_idx").on(t.createdAt)],
);

/** Personas silenciadas por el equipo (por navegador) hasta cierta fecha. */
export const chatMutes = pgTable("chat_mutes", {
  clientId: text("client_id").primaryKey(),
  until: timestamp("until", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pedidos de canciones de la audiencia que ve el DJ en el estudio. */
export const songRequests = pgTable(
  "song_requests",
  {
    id: pk(),
    clientId: text("client_id").notNull(),
    nickname: text("nickname").notNull(),
    title: text("title").notNull(),
    artist: text("artist"),
    /** Comentario corto de quien pide («para mi novia», «dedicada a…»). */
    note: text("note"),
    /** pending = esperando al DJ; played = ya sonó; rejected = descartado. */
    status: text("status").notNull().default("pending"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("song_requests_status_idx").on(t.status, t.createdAt)],
);

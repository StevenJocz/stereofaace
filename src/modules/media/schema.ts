import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk } from "@/lib/db/columns";
import { users } from "@/modules/users/schema";

/** Archivos subidos a almacenamiento compatible con S3. La clave nunca se deriva del nombre original. */
export const media = pgTable(
  "media",
  {
    id: pk(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    credit: text("credit"),
    /** Licencia o permiso que ampara el uso (obligatorio para material de terceros). */
    license: text("license"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_created_idx").on(t.createdAt)],
);

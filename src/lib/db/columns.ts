import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Clave primaria uuid generada por la base de datos. */
export const pk = () => uuid("id").primaryKey().defaultRandom();

/** Marcas de creación y actualización. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

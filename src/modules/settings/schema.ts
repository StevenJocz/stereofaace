import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk } from "@/lib/db/columns";
import { users } from "@/modules/users/schema";

/** Configuración global editable desde /admin (nombre, logo, colores, menú, redes, SEO, pie…). */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const SUBSCRIBER_STATES = ["pending", "confirmed", "unsubscribed"] as const;
export type SubscriberState = (typeof SUBSCRIBER_STATES)[number];
export const subscriberStateEnum = pgEnum("subscriber_state", SUBSCRIBER_STATES);

export const subscribers = pgTable(
  "subscribers",
  {
    id: pk(),
    email: text("email").notNull(),
    status: subscriberStateEnum("status").notNull().default("pending"),
    locale: text("locale").notNull().default("es"),
    source: text("source").notNull().default("web"),
    /** Momento en que la persona pidió suscribirse (consentimiento). */
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscribers_email_lower_idx").on(sql`lower(${t.email})`)],
);

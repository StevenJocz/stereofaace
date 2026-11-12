import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Solo se necesita para `db:push`/`studio`; `generate` no se conecta.
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/stereoface" },
  strict: true,
  verbose: true,
});

import fs from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

/**
 * Acceso a PostgreSQL.
 *  - Con DATABASE_URL: PostgreSQL real vía `pg` (producción y Docker Compose).
 *  - Sin DATABASE_URL: PGlite (PostgreSQL en WebAssembly) en `.data/pglite`, solo para desarrollo y pruebas
 *    cuando no hay un servidor PostgreSQL disponible. Es un proceso único: no usar en producción.
 * Ambos exponen la misma API de Drizzle, así que los servicios no saben cuál se usa.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbHandle = { db: Db; driver: "pg" | "pglite"; close: () => Promise<void> };

export type CreateDbOptions = {
  url?: string;
  /** Directorio de PGlite; `null` = en memoria (pruebas). */
  pgliteDir?: string | null;
};

const MIGRATIONS = path.join(process.cwd(), "drizzle");

export async function createDb(options: CreateDbOptions = {}): Promise<DbHandle> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    return { db: drizzle(pool, { schema }) as unknown as Db, driver: "pg", close: () => pool.end() };
  }
  // PGlite es de un solo proceso y guarda en disco local: en producción sería pérdida de datos silenciosa
  // (p. ej. un contenedor sin DATABASE_URL). Se exige PostgreSQL real salvo opt-in explícito.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "1")
    throw new Error(
      "DATABASE_URL no está definida. En producción se requiere PostgreSQL (ALLOW_PGLITE=1 solo para pruebas locales).",
    );
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = options.pgliteDir === undefined ? path.join(process.cwd(), ".data", "pglite") : options.pgliteDir;
  if (dir !== null) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = dir === null ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  return { db: drizzle(client, { schema }) as unknown as Db, driver: "pglite", close: () => client.close() };
}

/** Aplica las migraciones de ./drizzle (idempotente). */
export async function migrateDb(handle: DbHandle): Promise<void> {
  if (handle.driver === "pg") {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(handle.db as never, { migrationsFolder: MIGRATIONS });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(handle.db as never, { migrationsFolder: MIGRATIONS });
  }
}

const g = globalThis as unknown as { __sfDb?: Promise<DbHandle> };

/** Conexión compartida del proceso (sobrevive al HMR de desarrollo). Migra al abrir si usa PGlite. */
export function getDb(): Promise<Db> {
  g.__sfDb ??= (async () => {
    const handle = await createDb();
    if (handle.driver === "pglite") await migrateDb(handle);
    return handle;
  })();
  return g.__sfDb.then((h) => h.db);
}

export { schema };

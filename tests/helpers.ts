import { createDb, migrateDb, type DbHandle } from "@/lib/db";
import { seedDemo } from "@/db/seed";

/** Base PostgreSQL (PGlite) en memoria, migrada con las mismas migraciones que producción. */
export async function makeDb(opts: { seed?: boolean; now?: Date } = {}): Promise<DbHandle> {
  const handle = await createDb({ pgliteDir: null, url: "" });
  await migrateDb(handle);
  if (opts.seed) await seedDemo(handle.db, opts.now);
  return handle;
}

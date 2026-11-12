/**
 * CLI de base de datos:  tsx scripts/db.ts <migrate|seed|reset>
 *  migrate  aplica las migraciones de ./drizzle
 *  seed     migra y carga el contenido de demostración (marcado is_demo)
 *  reset    solo PGlite: borra .data/pglite y vuelve a migrar y sembrar
 */
import fs from "node:fs";
import path from "node:path";
import { createDb, migrateDb } from "../src/lib/db";
import { seedDemo } from "../src/db/seed";

const cmd = process.argv[2];

async function main() {
  if (cmd === "reset") {
    if (process.env.DATABASE_URL) throw new Error("reset solo borra PGlite; con DATABASE_URL hazlo a mano.");
    fs.rmSync(path.join(process.cwd(), ".data", "pglite"), { recursive: true, force: true });
  }
  if (!["migrate", "seed", "reset"].includes(cmd ?? "")) {
    console.error("Uso: tsx scripts/db.ts <migrate|seed|reset>");
    process.exit(1);
  }
  const handle = await createDb();
  try {
    await migrateDb(handle);
    console.log(`✓ migraciones aplicadas (${handle.driver})`);
    if (cmd === "seed" || cmd === "reset") {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1")
        throw new Error("Seed demo bloqueado en producción (ALLOW_DEMO_SEED=1 para forzarlo).");
      const r = await seedDemo(handle.db);
      console.log(`✓ contenido demo cargado (${r.articles} artículos)`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

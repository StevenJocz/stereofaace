/**
 * Arranque de base de datos en producción (se empaqueta a dist/migrate.mjs; no necesita tsx ni devDependencies).
 *
 *  1. Espera a PostgreSQL (hasta 60 s).
 *  2. Aplica las migraciones de ./drizzle (idempotente).
 *  3. Carga los datos base: categorías, géneros, The Lot Radio desactivada y ajustes (idempotente; sin demo).
 *  4. Primer administrador: si define ADMIN_EMAIL y ADMIN_PASSWORD y todavía NO existe ningún superadministrador,
 *     lo crea. Después puedes quitar esas variables del entorno.
 *  5. Usuarios adicionales (no hay pantalla de usuarios todavía): ADD_USER_EMAIL, ADD_USER_PASSWORD, ADD_USER_NAME y
 *     ADD_USER_ROLE (superadmin|admin|editor|redactor|colaborador). Si el correo ya existe, no hace nada.
 *
 * Requiere DATABASE_URL. Nunca imprime contraseñas ni la cadena de conexión.
 */
import { eq, sql } from "drizzle-orm";
import { createDb, migrateDb, type DbHandle } from "../src/lib/db";
import { seedBase } from "../src/db/seed-base";
import { createUser } from "../src/modules/users/auth";
import { ROLES, users, type Role } from "../src/modules/users/schema";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(): Promise<DbHandle> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const handle = await createDb();
    try {
      await handle.db.execute(sql`select 1`);
      return handle;
    } catch (error) {
      lastError = error;
      await handle.close().catch(() => {});
      console.log(`… esperando a PostgreSQL (${attempt}/30)`);
      await sleep(2000);
    }
  }
  throw new Error(`No se pudo conectar a PostgreSQL: ${lastError instanceof Error ? lastError.message : lastError}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  const handle = await connect();
  try {
    await migrateDb(handle);
    console.log("✓ migraciones aplicadas");
    await seedBase(handle.db);
    console.log("✓ datos base cargados");

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      const existing = await handle.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "superadmin"))
        .limit(1);
      if (existing.length === 0) {
        await createUser(handle.db, {
          email,
          name: process.env.ADMIN_NAME ?? "Administrador",
          role: "superadmin",
          password,
        });
        console.log(`✓ superadministrador creado: ${email}`);
      } else {
        console.log("· ya existe un superadministrador: se ignora ADMIN_EMAIL/ADMIN_PASSWORD");
      }
    } else {
      console.log("· sin ADMIN_EMAIL/ADMIN_PASSWORD: no se crea administrador");
    }

    const addEmail = process.env.ADD_USER_EMAIL;
    const addPassword = process.env.ADD_USER_PASSWORD;
    if (addEmail && addPassword) {
      const role = (process.env.ADD_USER_ROLE ?? "editor") as Role;
      if (!ROLES.includes(role)) throw new Error(`ADD_USER_ROLE debe ser uno de: ${ROLES.join(", ")}`);
      const dup = await handle.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${addEmail.trim().toLowerCase()}`)
        .limit(1);
      if (dup.length) console.log(`· ya existe ${addEmail}: no se modifica`);
      else {
        await createUser(handle.db, {
          email: addEmail,
          name: process.env.ADD_USER_NAME ?? addEmail,
          role,
          password: addPassword,
        });
        console.log(`✓ usuario ${role} creado: ${addEmail}`);
      }
    }
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exit(1);
});

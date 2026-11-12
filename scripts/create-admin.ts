/**
 * Crea un usuario de administración.
 *   ADMIN_EMAIL=... ADMIN_NAME="..." ADMIN_PASSWORD=... [ADMIN_ROLE=superadmin] npm run admin:create
 * La contraseña se lee del entorno (nunca de un argumento ni de un archivo del repositorio).
 */
import { createDb, migrateDb } from "../src/lib/db";
import { createUser } from "../src/modules/users/auth";
import { ROLES, type Role } from "../src/modules/users/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const password = process.env.ADMIN_PASSWORD;
  const role = (process.env.ADMIN_ROLE ?? "superadmin") as Role;
  if (!email || !password) throw new Error("Define ADMIN_EMAIL y ADMIN_PASSWORD en el entorno (mín. 12 caracteres).");
  if (!ROLES.includes(role)) throw new Error(`ADMIN_ROLE debe ser uno de: ${ROLES.join(", ")}`);
  const handle = await createDb();
  try {
    await migrateDb(handle);
    await createUser(handle.db, { email, name, role, password });
    console.log(`✓ usuario ${role} creado: ${email}`);
  } finally {
    await handle.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

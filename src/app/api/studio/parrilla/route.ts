import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { parrillaHandler } from "@/modules/studio/data-http";

/** Programas y horarios de la emisora, para gestionarlos desde el estudio (solo `station:update`). */
export async function GET() {
  await connection();
  return parrillaHandler(await getDb(), await getCurrentUser());
}

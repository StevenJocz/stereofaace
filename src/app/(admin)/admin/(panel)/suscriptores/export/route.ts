import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { SUBSCRIBER_STATES, type SubscriberState } from "@/modules/settings/schema";
import { exportSubscribersCsv } from "@/modules/settings/subscribers-admin";

/** Descarga los suscriptores (con el filtro actual) como CSV. Exige sesión y `subscriber:read`. */
export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("Inicia sesión.", { status: 401 });
  if (!can(actor.role, "subscriber:read")) return new Response("Sin permiso.", { status: 403 });
  const { searchParams } = new URL(request.url);
  const status = SUBSCRIBER_STATES.find((s) => s === searchParams.get("estado")) as SubscriberState | undefined;
  const csv = await exportSubscribersCsv(await getDb(), actor, { status, search: searchParams.get("q") ?? undefined });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="suscriptores.csv"',
      "cache-control": "no-store",
    },
  });
}

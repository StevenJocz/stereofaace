"use server";

import { guard, withoutValues, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { saveFacebookConfig, syncFacebook } from "@/modules/social/facebook";
import { assertCan } from "@/lib/rbac";

export async function saveFacebookAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const state = await guard(fd, "facebook", async () => {
    await saveFacebookConfig(await getDb(), user, { enabled: fd.get("enabled") === "on", token: String(fd.get("token") ?? "").trim() });
    return "Ajustes de Facebook guardados";
  });
  return withoutValues(state, ["token"]); // el token nunca vuelve al navegador
}

export async function syncFacebookNowAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "facebook-sync", async () => {
    assertCan(user, "setting:update");
    const r = await syncFacebook(await getDb());
    return r.posted + r.failed === 0 ? "No hay notas pendientes por publicar." : `Publicadas: ${r.posted}. Con error: ${r.failed}.`;
  });
}

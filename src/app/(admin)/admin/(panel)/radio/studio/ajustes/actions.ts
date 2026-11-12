"use server";

import { guard, withoutValues, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { saveRelayConfig } from "@/modules/studio/relay";
import { saveStudioConfig } from "@/modules/studio/settings";

const val = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveStudioConfigAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const state = await guard(fd, "studio-ajustes", async () => {
    await saveStudioConfig(await getDb(), user, {
      baseUrl: val(fd, "baseUrl"),
      stationId: val(fd, "stationId"),
      apiKey: val(fd, "apiKey"),
    });
    return "Ajustes del estudio guardados";
  });
  return withoutValues(state, ["apiKey"]); // la clave nunca vuelve al navegador
}

const AUTODJ_NOTE = {
  skipped: "",
  synced: " Lista del AutoDJ actualizada en AzuraCast.",
  no_key: " Falta la clave API de AzuraCast: guárdala arriba para activarla en el AutoDJ.",
  failed: " No se pudo actualizar el AutoDJ en AzuraCast (revisa la clave y sus permisos sobre las listas).",
} as const;

export async function saveRelayConfigAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "studio-senal", async () => {
    const r = await saveRelayConfig(await getDb(), user, {
      name: val(fd, "relayName"),
      url: val(fd, "relayUrl"),
      autodj: fd.get("relayAutodj") === "on",
    });
    return `Señal externa guardada.${AUTODJ_NOTE[r.autodj]}`;
  });
}

"use server";

import { guard, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { saveAdsConfig } from "@/modules/settings/ads";

export async function saveAdsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "publicidad", async () => {
    await saveAdsConfig(await getDb(), user, {
      enabled: fd.get("enabled") === "on",
      publisherId: String(fd.get("publisherId") ?? "").trim(),
      slotHome: String(fd.get("slotHome") ?? "").trim(),
      slotArticle: String(fd.get("slotArticle") ?? "").trim(),
    });
    return "Ajustes de publicidad guardados";
  });
}

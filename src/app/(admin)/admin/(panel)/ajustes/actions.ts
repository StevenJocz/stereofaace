"use server";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { guard, type FormState } from "@/lib/admin/form";
import { saveSiteSettings } from "@/modules/settings/site";
import { SOCIAL_KEYS } from "@/modules/settings/site-validators";

const val = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "ajustes", async () => {
    await saveSiteSettings(await getDb(), user, {
      site: { name: val(fd, "site_name"), tagline: val(fd, "site_tagline"), description: val(fd, "site_description") },
      social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, val(fd, `social_${k}`) || undefined])),
      newsletter: { title: val(fd, "newsletter_title"), text: val(fd, "newsletter_text") },
      footer: { text: val(fd, "footer_text") },
    });
    return "Ajustes guardados";
  });
}

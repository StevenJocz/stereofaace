"use server";

import { guard, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { saveStudioConfig } from "@/modules/studio/settings";

const val = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveStudioConfigAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "studio-ajustes", async () => {
    await saveStudioConfig(await getDb(), user, {
      baseUrl: val(fd, "baseUrl"),
      stationId: val(fd, "stationId"),
      apiKey: val(fd, "apiKey"),
    });
    return "Ajustes del estudio guardados";
  });
}

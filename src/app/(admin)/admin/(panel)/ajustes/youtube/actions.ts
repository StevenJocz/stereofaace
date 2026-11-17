"use server";

import { guard, str, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { disconnectYouTube, setVideoPrivacy } from "@/modules/video/service";

export async function setPrivacyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "youtube-privacy", async () => {
    const v = str(fd, "privacy");
    if (v !== "public" && v !== "unlisted") throw new DomainError("video_privacy", "Elige una privacidad válida.");
    await setVideoPrivacy(await getDb(), user, v);
    return v === "public" ? "Los próximos directos serán públicos." : "Los próximos directos serán no listados.";
  });
}

export async function disconnectYouTubeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "youtube-disconnect", async () => {
    await disconnectYouTube(await getDb(), user);
    return "YouTube desconectado. El acceso quedó revocado en Google.";
  });
}

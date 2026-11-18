"use server";

import { guard, str, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addGenreOption, closeReport, flagAsset, setDisabled, setFeatured, setGenreActive, setThemeActive, setVerifiedBadge } from "@/modules/spaces/moderation";

const need = (v: string | undefined, what: string) => {
  if (!v) throw new DomainError("bad_request", `Falta ${what}`);
  return v;
};

export async function featureAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await setFeatured(await getDb(), user, need(str(fd, "id"), "el perfil"), str(fd, "value") === "1");
    return "Listo";
  });
}

export async function verifyBadgeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await setVerifiedBadge(await getDb(), user, need(str(fd, "id"), "el perfil"), str(fd, "value") === "1");
    return "Listo";
  });
}

export async function disableAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await setDisabled(await getDb(), user, need(str(fd, "id"), "el perfil"), str(fd, "value") === "1", str(fd, "reason"));
    return "Listo";
  });
}

export async function closeReportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await closeReport(await getDb(), user, need(str(fd, "id"), "el reporte"));
    return "Reporte cerrado";
  });
}

export async function flagAssetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await flagAsset(await getDb(), user, need(str(fd, "id"), "la imagen"), str(fd, "value") === "1");
    return "Listo";
  });
}

export async function addGenreAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await addGenreOption(await getDb(), user, { slug: str(fd, "slug"), name: str(fd, "name") });
    return "Género agregado";
  });
}

export async function genreActiveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await setGenreActive(await getDb(), user, need(str(fd, "id"), "el género"), str(fd, "value") === "1");
    return "Listo";
  });
}

export async function themeActiveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "spaces", async () => {
    await setThemeActive(await getDb(), user, need(str(fd, "id"), "la plantilla"), str(fd, "value") === "1");
    return "Listo";
  });
}

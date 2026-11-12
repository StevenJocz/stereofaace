"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { createSource, deleteSource, markTermsVerified, setSourceActive, updateSource } from "@/modules/ingest/admin";

function sourceRaw(fd: FormData) {
  return {
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    url: str(fd, "url"),
    intervalMinutes: Number(str(fd, "intervalMinutes") ?? 60),
    defaultCategoryId: str(fd, "defaultCategoryId"),
    rightsPolicy: str(fd, "rightsPolicy"),
    publishPolicy: str(fd, "publishPolicy"),
    dailyLimit: Number(str(fd, "dailyLimit") ?? 20),
    legalNotes: str(fd, "legalNotes"),
  };
}

export async function saveSourceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  let createdId: string | undefined;
  const result = await guard(fd, "fuentes", async () => {
    const db = await getDb();
    if (id) {
      await updateSource(db, user, id, sourceRaw(fd));
      return "Cambios guardados. Si cambiaste la URL, la fuente se desactivó y hay que verificar de nuevo sus términos.";
    }
    createdId = (await createSource(db, user, sourceRaw(fd))).id;
  });
  if (result?.ok && createdId) redirect(`/admin/fuentes/${createdId}?creada=1`);
  return result;
}

export async function verifyTermsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "fuentes", async () => {
    if (!id) throw new DomainError("bad_request", "Falta la fuente");
    await markTermsVerified(await getDb(), user, id);
    return "Términos marcados como verificados";
  });
}

export async function sourceActiveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const active = fd.get("active") === "1";
  return guard(fd, "fuentes", async () => {
    if (!id) throw new DomainError("bad_request", "Falta la fuente");
    await setSourceActive(await getDb(), user, id, active);
    return active ? "Fuente activada" : "Fuente desactivada";
  });
}

export async function deleteSourceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const result = await guard(fd, "fuentes", async () => {
    if (!id) throw new DomainError("bad_request", "Falta la fuente");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await deleteSource(await getDb(), user, id);
  });
  if (result?.ok) redirect("/admin/fuentes?borrada=1");
  return result;
}

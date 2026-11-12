"use server";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { deleteTaxonomy, saveTaxonomy, type TaxonomyKind } from "@/modules/taxonomy/admin";

const kindOf = (fd: FormData): TaxonomyKind => {
  const k = str(fd, "kind");
  if (k !== "category" && k !== "tag" && k !== "genre") throw new DomainError("bad_request", "Tipo inválido");
  return k;
};

export async function saveTaxonomyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "taxonomia", async () => {
    const kind = kindOf(fd);
    await saveTaxonomy(await getDb(), user, kind, {
      id: str(fd, "id"),
      name: str(fd, "name"),
      slug: str(fd, "slug"),
      description: str(fd, "description"),
      color: str(fd, "color"),
      position: str(fd, "position"),
      family: str(fd, "family"),
    });
    return str(fd, "id") ? "Cambios guardados" : "Creado";
  });
}

export async function deleteTaxonomyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "taxonomia", async () => {
    const kind = kindOf(fd);
    if (!id) throw new DomainError("bad_request", "Falta el elemento");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await deleteTaxonomy(await getDb(), user, kind, id);
    return "Borrado";
  });
}

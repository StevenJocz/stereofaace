"use server";

import { guard, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { deleteCart, moveCart, updateCart } from "@/modules/studio/carts";

const val = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function updateCartAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "studio-cart-update", async () => {
    await updateCart(await getDb(), user, val(fd, "id"), {
      name: val(fd, "name"),
      kind: val(fd, "kind") as never,
      color: val(fd, "color"),
      hotkey: val(fd, "hotkey") || null,
      gainDb: Number(val(fd, "gainDb") || 0),
      duck: fd.get("duck") === "on",
    });
    return "Cart guardado";
  });
}

export async function moveCartAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "studio-cart-move", async () => {
    await moveCart(await getDb(), user, val(fd, "id"), val(fd, "direction") === "up" ? "up" : "down");
  });
}

export async function deleteCartAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "studio-cart-delete", async () => {
    if (val(fd, "confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar.");
    await deleteCart(await getDb(), user, val(fd, "id"));
    return "Cart borrado";
  });
}

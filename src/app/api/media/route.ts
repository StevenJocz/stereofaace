import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { listMediaAdmin } from "@/modules/media/admin";
import { createUploadedMedia } from "@/modules/media/service";

/** Biblioteca para el selector de imágenes del panel. Exige sesión y `media:read`. */
export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  if (!can(actor.role, "media:read")) return Response.json({ error: "No tienes permiso." }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? 1);
  const result = await listMediaAdmin(await getDb(), actor, {
    search: searchParams.get("search") ?? undefined,
    page: Number.isFinite(page) ? page : 1,
  });
  return Response.json(result);
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Inicia sesión para subir imágenes." }, { status: 401 });
  if (!can(actor.role, "media:create")) return Response.json({ error: "No tienes permiso para subir imágenes." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Selecciona una imagen." }, { status: 400 });
  try {
    const media = await createUploadedMedia(await getDb(), actor, file, {
      alt: String(form.get("alt") ?? ""),
      credit: String(form.get("credit") ?? ""),
      license: String(form.get("license") ?? ""),
    });
    return Response.json(media, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo subir la imagen." }, { status: 400 });
  }
}

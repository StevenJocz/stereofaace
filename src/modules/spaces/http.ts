import { ZodError } from "zod";
import type { Db } from "@/lib/db";
import { sameOrigin } from "@/lib/csrf";
import { DomainError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/modules/users/auth";
import { removeAsset, readSpaceAsset, uploadAsset } from "./assets";
import type { Mailer } from "./mailer";
import { getMySpace, publishSpace, saveDraft, searchCatalogArtists, setFavoriteArtists, setGenres, unpublishSpace, updateProfile, updateUsername } from "./profile";
import { follow, unfollow } from "./follows";
import { reportSpace } from "./public";

const NO_STORE = { "cache-control": "no-store" } as const;
const reply = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE });

const STATUS: Record<string, number> = {
  username_taken: 409,
  email_taken: 409,
  genre_exists: 409,
  space_disabled: 403,
  email_unverified: 403,
  not_found: 404,
  no_profile: 404,
  image_too_big: 413,
  quota: 413,
  gallery_full: 409,
  space_exists: 409,
  self_follow: 409,
  follow_limit: 409,
  token_invalid: 400,
};

/** Traduce sesión y errores esperables a respuestas HTTP. Nunca devuelve detalles internos. */
async function guarded(actor: SessionUser | null, work: (user: SessionUser) => Promise<Response>): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para editar tu Space.");
  try {
    return await work(actor);
  } catch (error) {
    if (error instanceof ZodError) return reply(400, error.issues[0]?.message ?? "Datos no válidos.");
    if (error instanceof ForbiddenError) return reply(403, "No tienes permiso para esta acción.");
    if (error instanceof DomainError) return reply(STATUS[error.code] ?? 400, error.message);
    console.error("[spaces]", error instanceof Error ? error.name : "error");
    return reply(500, "No se pudo completar la petición.");
  }
}

/** Mutaciones: el Origen debe ser el propio sitio (defensa CSRF además de SameSite=Lax). */
async function mutation(request: Request, actor: SessionUser | null, work: (user: SessionUser, body: unknown) => Promise<Response>, opts: { json?: boolean } = {}): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para editar tu Space.");
  if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
  let body: unknown = null;
  if (opts.json !== false) {
    const declared = Number(request.headers.get("content-length") ?? "NaN");
    if (Number.isFinite(declared) && declared > 100_000) return reply(413, "El contenido es demasiado grande.");
    try {
      body = await request.json();
    } catch {
      return reply(400, "Cuerpo no válido.");
    }
  }
  return guarded(actor, (u) => work(u, body));
}

export const meGetHandler = (db: Db, actor: SessionUser | null) => guarded(actor, async (u) => Response.json(await getMySpace(db, u.id), { headers: NO_STORE }));

export const meProfileHandler = (db: Db, actor: SessionUser | null, request: Request) =>
  mutation(request, actor, async (u, body) => {
    await updateProfile(db, u.id, body);
    return Response.json({ ok: true }, { headers: NO_STORE });
  });

export const meUsernameHandler = (db: Db, actor: SessionUser | null, request: Request) =>
  mutation(request, actor, async (u, body) => {
    if (!rateLimit(`spaces:username:${u.id}`, 10, 3600_000).ok) return reply(429, "Cambiaste tu nombre muchas veces. Espera un rato.");
    return Response.json(await updateUsername(db, u.id, (body as { username?: unknown })?.username), { headers: NO_STORE });
  });

export const meDesignHandler = (db: Db, actor: SessionUser | null, request: Request) =>
  mutation(request, actor, async (u, body) => Response.json({ design: await saveDraft(db, u.id, body) }, { headers: NO_STORE }));

export const meGenresHandler = (db: Db, actor: SessionUser | null, request: Request) =>
  mutation(request, actor, async (u, body) => Response.json({ genres: await setGenres(db, u.id, (body as { genres?: unknown })?.genres) }, { headers: NO_STORE }));

export const meArtistsHandler = (db: Db, actor: SessionUser | null, request: Request) =>
  mutation(request, actor, async (u, body) => {
    await setFavoriteArtists(db, u.id, (body as { artists?: unknown })?.artists);
    return Response.json({ ok: true }, { headers: NO_STORE });
  });

export const mePublishHandler = (db: Db, actor: SessionUser | null, request: Request, mailer: Mailer) =>
  mutation(
    request,
    actor,
    async (u) => {
      // Con el correo configurado se exige confirmarlo; sin proveedor de correo no se puede exigir.
      await publishSpace(db, u.id, { requireVerified: mailer.configured });
      return Response.json({ ok: true }, { headers: NO_STORE });
    },
    { json: false },
  );

export const meUnpublishHandler = (db: Db, actor: SessionUser | null, request: Request) =>
  mutation(
    request,
    actor,
    async (u) => {
      await unpublishSpace(db, u.id);
      return Response.json({ ok: true }, { headers: NO_STORE });
    },
    { json: false },
  );

export async function meAssetUploadHandler(db: Db, actor: SessionUser | null, request: Request, root: string): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para subir imágenes.");
  if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(declared)) return reply(411, "Falta el tamaño del contenido.");
  if (declared > 6 * 1024 * 1024) return reply(413, "La imagen supera el máximo de 5 MB.");
  if (!rateLimit(`spaces:upload:${actor.id}`, 30, 60_000).ok) return reply(429, "Demasiadas subidas seguidas. Espera un minuto.");
  return guarded(actor, async (u) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return reply(400, "Cuerpo no válido.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) return reply(400, "Elige una imagen.");
    const alt = typeof form.get("alt") === "string" ? (form.get("alt") as string) : undefined;
    const r = await uploadAsset(db, u.id, root, form.get("kind"), file, alt);
    return Response.json({ id: r.id, kind: r.kind, url: `/s/${r.storageKey}` }, { status: 201, headers: NO_STORE });
  });
}

export async function meAssetDeleteHandler(db: Db, actor: SessionUser | null, request: Request, root: string): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para editar tu Space.");
  if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
  return guarded(actor, async (u) => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(400, "Imagen no válida.");
    await removeAsset(db, u.id, root, id);
    return Response.json({ ok: true }, { headers: NO_STORE });
  });
}

export async function catalogArtistsHandler(db: Db, actor: SessionUser | null, q: string | null): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión.");
  if (!rateLimit(`spaces:artists:${actor.id}`, 60, 60_000).ok) return reply(429, "Demasiadas búsquedas.");
  return Response.json(await searchCatalogArtists(db, q ?? ""), { headers: NO_STORE });
}

export async function reportHandler(db: Db, actor: SessionUser | null, request: Request, ip: string): Promise<Response> {
  if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
  if (!rateLimit(`spaces:report:${actor?.id ?? ip}`, 5, 3600_000).ok) return reply(429, "Ya enviaste varios reportes. Espera un rato.");
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > 5000) return reply(413, "El contenido es demasiado grande.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, "Cuerpo no válido.");
  }
  try {
    await reportSpace(db, body, actor?.id ?? null);
    return Response.json({ ok: true }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof ZodError) return reply(400, error.issues[0]?.message ?? "Datos no válidos.");
    if (error instanceof DomainError) return reply(STATUS[error.code] ?? 400, error.message);
    return reply(500, "No se pudo enviar el reporte.");
  }
}

/** Imagen de un Space: pública si el Space está publicado y activo; su dueño siempre ve la suya. */
export async function spaceImageHandler(db: Db, actor: SessionUser | null, root: string, key: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(key)) return new Response(null, { status: 404 });
  const img = await readSpaceAsset(db, root, key, actor?.id ?? null);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "content-type": img.mime,
      // Corta y revalidable: si la administración desactiva un Space, sus imágenes dejan de servirse pronto.
      "cache-control": img.isPublic ? "public, max-age=300, stale-while-revalidate=300" : "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

/** Seguir (POST {username}) y dejar de seguir (DELETE ?username=). Siempre con la sesión: nadie sigue «en nombre de» otra persona. */
export async function followHandler(db: Db, actor: SessionUser | null, request: Request): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para seguir a otras personas.");
  if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
  if (!rateLimit(`spaces:follow:${actor.id}`, 30, 60_000).ok) return reply(429, "Demasiadas acciones seguidas. Espera un minuto.");
  return guarded(actor, async (u) => {
    if (request.method === "DELETE") {
      const username = new URL(request.url).searchParams.get("username") ?? "";
      return Response.json({ following: false, counts: await unfollow(db, u.id, username) }, { headers: NO_STORE });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reply(400, "Cuerpo no válido.");
    }
    const username = typeof (body as { username?: unknown })?.username === "string" ? (body as { username: string }).username : "";
    return Response.json({ following: true, counts: await follow(db, u.id, username) }, { headers: NO_STORE });
  });
}

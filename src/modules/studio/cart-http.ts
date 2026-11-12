import type { Db } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { DomainError } from "@/lib/errors";
import { createCart, listCarts, readCartAudio } from "./carts";
import { guarded, reply } from "./http";

export function cartsListHandler(db: Db, actor: Actor | null): Promise<Response> {
  return guarded(actor, async () => Response.json(await listCarts(db, actor)));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Audio de un cart con soporte de `Range`; nunca revela la clave de almacenamiento. */
export function cartAudioHandler(db: Db, actor: Actor | null, root: string, id: string, range: string | null): Promise<Response> {
  return guarded(actor, async () => {
    if (!UUID.test(id)) return reply(400, "Identificador de cart no válido.");
    const audio = await readCartAudio(db, actor, root, id);
    if (!audio) return reply(404, "Ese cart no existe.");
    const total = audio.bytes.length;
    const base = { "content-type": audio.mime, "cache-control": "private, max-age=3600", "accept-ranges": "bytes", "x-content-type-options": "nosniff" };
    const m = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response(new Uint8Array(audio.bytes), { status: 200, headers: { ...base, "content-length": String(total) } });
    }
    let start: number;
    let end: number;
    if (m[1] === "") {
      start = Math.max(0, total - Number(m[2])); // bytes=-N: los últimos N
      end = total - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
    }
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${total}` } });
    }
    const chunk = audio.bytes.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(chunk.length) },
    });
  });
}

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(v));
const text = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

/** Alta de un cart desde un formulario multipart (el audio puede pesar hasta 25 MB, demasiado para una acción de servidor). */
export function cartUploadHandler(db: Db, actor: Actor | null, root: string, form: FormData): Promise<Response> {
  return guarded(actor, async () => {
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("cart_bad_audio", "Elige un archivo de audio.");
    const view = await createCart(
      db,
      actor,
      root,
      {
        name: String(form.get("name") ?? ""),
        kind: String(form.get("kind") ?? "") as never,
        color: text(form.get("color")),
        hotkey: text(form.get("hotkey")),
        gainDb: num(form.get("gainDb")),
        duck: form.get("duck") === "on" || form.get("duck") === "true",
        durationSec: num(form.get("durationSec")),
      },
      file,
    );
    return Response.json(view, { status: 201 });
  });
}

import { z } from "zod";
import { countrySchema, isPublicHost, slugSchema } from "@/lib/validation";
import { EMBED_HOSTS } from "@/modules/releases/validators";
import { AUTHORIZATION_STATES, STREAM_KINDS } from "./schema";

/** https público: las señales http se bloquearían como contenido mixto y no se aceptan. */
const publicHttpsUrl = z
  .url()
  .max(2048)
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "https:" && !p.username && !p.password && isPublicHost(p.hostname);
    } catch {
      return false;
    }
  }, "Debe ser una URL https pública, sin credenciales");

/**
 * Hosts permitidos para reproductores incrustados: los proveedores oficiales conocidos más los que el
 * administrador del servidor añada en RADIO_EMBED_HOSTS (lista separada por comas).
 */
export function allowedEmbedHosts(extra = process.env.RADIO_EMBED_HOSTS ?? ""): string[] {
  return [
    ...EMBED_HOSTS,
    ...extra
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ];
}

export function isAllowedStationEmbedHost(hostname: string, extra?: string): boolean {
  const h = hostname.toLowerCase();
  return allowedEmbedHosts(extra).some((a) => h === a || h.endsWith(`.${a}`));
}

export const stationInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema.optional(),
    description: z.string().trim().max(600).optional(),
    country: countrySchema.optional(),
    genreIds: z.array(z.uuid()).max(6).default([]),
    streamKind: z.enum(STREAM_KINDS),
    streamUrl: publicHttpsUrl.optional(),
    embedUrl: publicHttpsUrl.optional(),
    corsEnabled: z.boolean().default(false),
    imageUrl: publicHttpsUrl.optional(),
    websiteUrl: publicHttpsUrl.optional(),
    attributionName: z.string().trim().min(2, "La atribución es obligatoria").max(120),
    attributionUrl: publicHttpsUrl,
    attributionNote: z.string().trim().max(300).optional(),
    position: z.number().int().min(0).max(999).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.embedUrl && !isAllowedStationEmbedHost(new URL(v.embedUrl).hostname))
      ctx.addIssue({
        code: "custom",
        path: ["embedUrl"],
        message: "Proveedor no permitido. Un administrador del servidor debe añadirlo a RADIO_EMBED_HOSTS.",
      });
    if (v.streamKind === "embed" && v.streamUrl)
      ctx.addIssue({ code: "custom", path: ["streamUrl"], message: "Un reproductor incrustado no usa URL de stream" });
    if (v.streamKind !== "embed" && v.embedUrl)
      ctx.addIssue({
        code: "custom",
        path: ["embedUrl"],
        message: "Solo las emisoras de tipo «embed» llevan URL de reproductor",
      });
  });
export type StationInput = z.infer<typeof stationInputSchema>;

/** Autorización: conceder exige dejar constancia (quién, cuándo y por qué medio). */
export const authorizationInputSchema = z
  .object({
    status: z.enum(AUTHORIZATION_STATES),
    notes: z.string().trim().max(2000).optional(),
    verifiedAt: z.coerce.date().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.status === "granted" || v.status === "not_required") && (v.notes ?? "").length < 10)
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Indica la evidencia: quién autoriza, cuándo y por qué medio (mín. 10 caracteres)",
      });
  });
export type AuthorizationInput = z.infer<typeof authorizationInputSchema>;

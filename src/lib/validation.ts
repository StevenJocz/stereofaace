import { z } from "zod";

/** Piezas de validación compartidas por los validadores de cada módulo. */

export const slugSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa minúsculas, números y guiones");

export const countrySchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, "Código ISO de 2 letras en mayúsculas");

/** Solo http(s). Las URL con credenciales embebidas se rechazan. */
export const httpUrlSchema = z
  .url()
  .max(2048)
  .refine((u) => {
    try {
      const p = new URL(u);
      return (p.protocol === "https:" || p.protocol === "http:") && !p.username && !p.password;
    } catch {
      return false;
    }
  }, "Solo http(s) y sin credenciales");

export const httpsUrlSchema = httpUrlSchema.refine((u) => u.startsWith("https://"), "Debe ser https");

/**
 * Rechaza destinos internos (localhost, redes privadas, metadatos de nube) para que un administrador
 * no pueda apuntar el motor de noticias contra la red interna (SSRF). La comprobación definitiva
 * también debe hacerse al resolver DNS en el conector.
 */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}

export const publicHttpUrlSchema = httpUrlSchema.refine(
  (u) => isPublicHost(new URL(u).hostname),
  "Destino no permitido",
);

export const uuidSchema = z.uuid();

export type FieldErrors = Record<string, string[]>;

/** Aplana los errores de Zod a `{ campo: [mensajes] }` para formularios y respuestas de API. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

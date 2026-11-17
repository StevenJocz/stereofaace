import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DomainError } from "@/lib/errors";

/**
 * Cifrado de secretos en reposo (refresh token de Google): AES-256-GCM con una clave de 32 bytes que vive
 * SOLO en el entorno del servidor (`VIDEO_SECRET_KEY`, base64 o hex). Formato: `v1.<iv>.<etiqueta>.<texto>` en base64url.
 */
export function parseKey(raw: string | undefined): Buffer {
  const v = (raw ?? "").trim();
  const key = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (key.length !== 32) throw new DomainError("video_key", "VIDEO_SECRET_KEY debe ser una clave de 32 bytes (base64 o hexadecimal de 64 caracteres).");
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptSecret(packed: string, key: Buffer): string {
  const [v, iv, tag, body] = packed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new DomainError("video_secret", "El secreto guardado no tiene un formato válido.");
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    // Clave cambiada o dato manipulado: nunca se devuelve el motivo técnico.
    throw new DomainError("video_secret", "No se pudo descifrar el secreto guardado. Reconecta YouTube.");
  }
}

/** Quita de un texto cualquier secreto conocido (para que ni un error ni un registro lo lleven). */
export function redactSecrets(text: string, secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("***");
  return out;
}

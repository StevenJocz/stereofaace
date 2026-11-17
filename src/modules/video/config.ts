import { parseKey } from "./crypto";

/** Variables de entorno del módulo. Los valores secretos solo se leen en el servidor y nunca se devuelven al navegador. */
export type VideoEnv = {
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;
  secretKey: Buffer;
  livekitUrl: string;
  livekitKey: string;
  livekitSecret: string;
};

export const VIDEO_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "VIDEO_SECRET_KEY",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
] as const;

/** Nombres de las variables que faltan (para avisar al superadministrador sin mostrar valores). */
export function missingVideoEnv(env: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = VIDEO_ENV_VARS.filter((k) => !env[k]?.trim());
  if (env.VIDEO_SECRET_KEY?.trim()) {
    try {
      parseKey(env.VIDEO_SECRET_KEY);
    } catch {
      if (!missing.includes("VIDEO_SECRET_KEY")) missing.push("VIDEO_SECRET_KEY");
    }
  }
  const lk = env.LIVEKIT_URL?.trim();
  if (lk && !/^wss?:\/\//.test(lk) && !missing.includes("LIVEKIT_URL")) missing.push("LIVEKIT_URL");
  return missing;
}

export function readVideoEnv(env: Record<string, string | undefined> = process.env, siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"): VideoEnv | null {
  if (missingVideoEnv(env).length) return null;
  return {
    googleClientId: env.GOOGLE_CLIENT_ID!.trim(),
    googleClientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri: (env.GOOGLE_REDIRECT_URI?.trim() || `${siteUrl.replace(/\/$/, "")}/api/youtube/oauth/callback`),
    secretKey: parseKey(env.VIDEO_SECRET_KEY),
    livekitUrl: env.LIVEKIT_URL!.trim().replace(/\/$/, ""),
    livekitKey: env.LIVEKIT_API_KEY!.trim(),
    livekitSecret: env.LIVEKIT_API_SECRET!.trim(),
  };
}

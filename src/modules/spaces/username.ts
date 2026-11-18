import { z } from "zod";

/** Rutas y nombres que no pueden ser un usuario (la dirección pública es /@usuario, pero se reservan para evitar confusiones y suplantación). */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrador", "administrator", "api", "app", "root", "sistema", "system", "soporte", "support", "ayuda", "help",
  "stereoface", "stereo", "face", "staff", "equipo", "team", "moderador", "mod", "oficial", "official", "radio", "cabina", "dj",
  "spaces", "space", "u", "s", "media", "static", "public", "assets", "login", "logout", "entrar", "salir", "registro", "register", "signup", "signin",
  "noticias", "artistas", "programas", "lanzamientos", "agenda", "eventos", "pagina", "paginas", "p", "rss", "sitemap", "robots", "ads", "cookies",
  "privacidad", "terminos", "contacto", "newsletter", "buscar", "search", "cuenta", "perfil", "profile", "settings", "ajustes", "null", "undefined",
]);

/** 3–20 caracteres: minúsculas, números y guion bajo; empieza con letra o número. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_]{2,19}$/, "Usa 3 a 20 caracteres: letras, números y guion bajo")
  .refine((u) => !RESERVED_USERNAMES.has(u), "Ese nombre de usuario está reservado");

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase().replace(/^@/, "");

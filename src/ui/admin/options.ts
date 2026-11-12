/**
 * Etiquetas y opciones compartidas entre formularios (cliente) y listados (servidor).
 * Viven aquí, fuera de los módulos "use client": un valor exportado desde un módulo de cliente llega al
 * servidor como referencia, no como dato.
 */

export const RELEASE_KIND_OPTIONS: [string, string][] = [
  ["album", "Álbum"],
  ["ep", "EP"],
  ["single", "Single"],
  ["remix", "Remix"],
  ["video", "Video"],
  ["set", "Set"],
  ["podcast", "Podcast"],
];

export const EVENT_KIND_OPTIONS: [string, string][] = [
  ["festival", "Festival"],
  ["concierto", "Concierto"],
  ["rave", "Rave"],
  ["presentacion", "Presentación"],
  ["underground", "Underground"],
  ["gira", "Gira"],
];

export const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  editor: "Editor",
  redactor: "Redactor",
  colaborador: "Colaborador",
};

export const KIND_LABEL: Record<string, string> = { rss: "RSS", atom: "Atom", api: "API", ical: "iCal", manual: "Manual" };
export const RIGHTS_LABEL: Record<string, string> = {
  metadata_only: "Solo metadatos (título, enlace y atribución)",
  licensed: "Con licencia (permite artículo desarrollado)",
  express_permission: "Con permiso expreso (permite artículo desarrollado)",
};
export const PUBLISH_LABEL: Record<string, string> = {
  always_review: "Siempre revisar antes de publicar",
  autopublish: "Publicar automáticamente (exige términos verificados)",
};

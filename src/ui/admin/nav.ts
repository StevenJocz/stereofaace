import type { Permission } from "@/lib/rbac";

export type AdminNavItem = { href: string; label: string; permission: Permission };
export type AdminNavGroup = { group: string; items: AdminNavItem[] };

/** Navegación del panel. Cada sección se añade aquí; la barra solo muestra lo que el rol puede leer. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    group: "Contenido",
    items: [
      { href: "/admin/articulos", label: "Artículos", permission: "article:read" },
      { href: "/admin/portada", label: "Portada", permission: "article:publish" },
      { href: "/admin/paginas", label: "Páginas", permission: "page:read" },
    ],
  },
  {
    group: "Catálogo",
    items: [
      { href: "/admin/artistas", label: "Artistas", permission: "artist:read" },
      { href: "/admin/lanzamientos", label: "Lanzamientos", permission: "release:read" },
      { href: "/admin/agenda", label: "Agenda", permission: "event:read" },
    ],
  },
  {
    group: "Organización",
    items: [
      { href: "/admin/taxonomia", label: "Taxonomía", permission: "category:read" },
      { href: "/admin/medios", label: "Medios", permission: "media:read" },
    ],
  },
  {
    group: "Audiencia",
    items: [
      { href: "/admin/suscriptores", label: "Suscriptores", permission: "subscriber:read" },
      { href: "/admin/radio", label: "Radio", permission: "station:read" },
      { href: "/admin/radio/studio", label: "Estudio", permission: "station:update" },
      { href: "/admin/radio/programacion", label: "Programación", permission: "station:update" },
    ],
  },
  {
    group: "Sistema",
    items: [
      { href: "/admin/ajustes", label: "Ajustes", permission: "setting:read" },
      { href: "/admin/usuarios", label: "Usuarios", permission: "user:read" },
      { href: "/admin/auditoria", label: "Auditoría", permission: "audit:read" },
      { href: "/admin/fuentes", label: "Fuentes", permission: "source:read" },
    ],
  },
];

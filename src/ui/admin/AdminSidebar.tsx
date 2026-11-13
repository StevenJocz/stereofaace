"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/ui/Header";

export type SidebarGroup = { group: string; items: { href: string; label: string }[] };

const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** Iconos por ruta (trazos simples, mismo estilo). */
const ICONS: Record<string, React.ReactNode> = {
  "/admin": I("M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5"),
  "/admin/articulos": I("M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"),
  "/admin/portada": I("M3 5h18v14H3zM3 10h18M8 14h8"),
  "/admin/paginas": I("M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h4"),
  "/admin/artistas": I("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"),
  "/admin/lanzamientos": I("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"),
  "/admin/agenda": I("M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"),
  "/admin/taxonomia": I("M20 12.5 12.5 20a1.5 1.5 0 0 1-2.1 0L3 12.6V3h9.6l7.4 7.4a1.5 1.5 0 0 1 0 2.1zM7.5 7.5h.01"),
  "/admin/medios": I("M3 5h18v14H3zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5-8 8"),
  "/admin/suscriptores": I("M3 6h18v12H3zM3 7l9 6 9-6"),
  "/admin/radio": I("M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM7 8l10-4M8 14h5M16.5 14h.01"),
  "/admin/radio/studio": I("M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6"),
  "/admin/radio/programacion": I("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"),
  "/admin/ajustes": I("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"),
  "/admin/usuarios": I("M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2.1.7 3.5 2.6 3.5 5.7"),
  "/admin/auditoria": I("M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6zM9 12l2 2 4-4"),
  "/admin/fuentes": I("M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M5.5 19h.01"),
  "/admin/ajustes/facebook": I("M14 8h2V4h-3a4 4 0 0 0-4 4v2H7v4h2v6h4v-6h2.5l.5-4h-3V8.5A.5.5 0 0 1 14 8z"),
};

const STORE = "sf-admin-sidebar-collapsed";

/** Gana la ruta más específica que coincida con la dirección actual. */
function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const h of hrefs) {
    if (pathname === h || (h !== "/admin" && pathname.startsWith(`${h}/`))) {
      if (!best || h.length > best.length) best = h;
    }
  }
  return best;
}

export function AdminSidebar({ groups, email, role, logout }: { groups: SidebarGroup[]; email: string; role: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Cierra el cajón del móvil al navegar (ajuste de estado durante el render, sin efecto).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    try {
      if (localStorage.getItem(STORE) === "1") setCollapsed(true); // eslint-disable-line react-hooks/set-state-in-effect -- preferencia guardada solo existe en el navegador
    } catch {
      /* sin almacenamiento: queda expandida */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORE, next ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  };

  // La consola del estudio necesita todo el ancho: ahí el menú va siempre contraído.
  const forced = pathname === "/admin/radio/studio";
  const isCollapsed = collapsed || forced;
  const all = ["/admin", ...groups.flatMap((g) => g.items.map((i) => i.href))];
  const current = activeHref(pathname, all);
  const link = (href: string, label: string) => (
    <Link key={href} href={href} className="adm-link" aria-current={current === href ? "page" : undefined} title={isCollapsed ? label : undefined}>
      {ICONS[href]}
      <span className="adm-label">{label}</span>
    </Link>
  );

  return (
    <>
      <div className="adm-topbar">
        <button type="button" className="adm-burger" aria-label="Abrir el menú" aria-expanded={open} aria-controls="adm-nav" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/admin" className="flex items-center gap-2" aria-label="Administración, inicio">
          <Mark size={26} />
          <span className="display-wide text-[1rem]">
            Stereo<span className="text-accent-ink">Face</span>
          </span>
        </Link>
        <span className="tag ml-auto">Admin</span>
      </div>

      {open && <button type="button" className="adm-backdrop" aria-label="Cerrar el menú" onClick={() => setOpen(false)} />}

      <aside id="adm-nav" className="adm-side" data-open={open} data-collapsed={isCollapsed} data-forced={forced} aria-label="Administración">
        <div className="adm-brand">
          <Link href="/admin" className="flex min-w-0 items-center gap-3" aria-label="Administración, inicio">
            <Mark size={30} />
            <span className="adm-label display-wide text-[1.05rem]">
              Stereo<span className="text-accent-ink">Face</span>
            </span>
          </Link>
          <button type="button" className="adm-collapse" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir el menú" : "Contraer el menú"} aria-pressed={collapsed}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: collapsed ? "rotate(180deg)" : undefined }}>
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="adm-close" onClick={() => setOpen(false)} aria-label="Cerrar el menú">
            ✕
          </button>
        </div>

        <nav className="adm-nav" aria-label="Secciones">
          {link("/admin", "Panel")}
          {groups.map((g) => (
            <div key={g.group} className="adm-group">
              <p className="adm-group-title">{g.group}</p>
              {g.items.map((i) => link(i.href, i.label))}
            </div>
          ))}
        </nav>

        <div className="adm-user">
          <span className="adm-avatar" aria-hidden="true">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <span className="adm-label min-w-0">
            <span className="block truncate text-[0.82rem]">{email}</span>
            <span className="mono block text-accent-ink">{role}</span>
          </span>
          <form action={logout} className="adm-logout">
            <button type="submit" className="adm-out" aria-label="Salir" title="Salir">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />
              </svg>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

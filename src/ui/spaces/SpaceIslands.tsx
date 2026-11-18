"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRadio } from "@/ui/radio/RadioProvider";
import { Icon } from "./SpaceIcons";

/** Botón para escuchar StereoFace Radio desde el Space. Reutiliza el reproductor global: nunca arranca solo. */
export function SpaceRadio() {
  const r = useRadio();
  const playing = r.status === "playing" || r.status === "loading" || r.status === "reconnecting";
  return (
    <div className="space-radio" data-playing={playing || undefined}>
      <button type="button" className="space-play space-play-ring" onClick={() => r.toggle()} aria-pressed={playing} aria-label={playing ? "Pausar StereoFace Radio" : "Escuchar StereoFace Radio"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0">
        <p className="space-radio-name">
          StereoFace Radio {playing && <span className="space-live">EN VIVO</span>}
        </p>
        <p className="space-radio-sub">{r.current ? r.current.name : "Toca para escuchar"}</p>
      </div>
      <span className="space-wave" aria-hidden="true">
        {[30, 55, 40, 75, 60, 90, 45, 70, 35, 80, 50, 95, 65, 40, 72, 55, 85, 38].map((h, i) => (
          <i key={i} style={{ ["--h" as string]: `${h}%`, ["--d" as string]: `${(i % 6) * 0.12}s` }} />
        ))}
      </span>
    </div>
  );
}

type FollowItem = { username: string; displayName: string; avatarUrl: string | null };

/** Ventana con la lista de seguidores o de seguidos de un Space (paginada, «Ver más»). Esc o clic fuera la cierran. */
function FollowListDialog({ username, kind, onClose }: { username: string; kind: "followers" | "following"; onClose: () => void }) {
  const [items, setItems] = useState<FollowItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/spaces/follows?username=${encodeURIComponent(username)}&kind=${kind}&page=${page}`, { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { items?: FollowItem[]; total?: number; error?: string };
        if (!r.ok) throw new Error(body.error ?? "No se pudo cargar la lista.");
        if (!alive) return;
        setItems((cur) => (page === 1 ? (body.items ?? []) : [...cur, ...(body.items ?? [])]));
        setTotal(body.total ?? 0);
        setState("ok");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [username, kind, page]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const title = kind === "followers" ? "Seguidores" : "Siguiendo";
  const more = total !== null && items.length < total && state === "ok";
  return (
    <div className="space-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="space-modal-box" role="dialog" aria-modal="true" aria-label={`${title} de @${username}`}>
        <header className="space-modal-head">
          <h2>
            {title}
            {total !== null && <span> · {new Intl.NumberFormat("es-CO").format(total)}</span>}
          </h2>
          <button ref={closeRef} type="button" className="space-modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="space-modal-body">
          {state === "loading" && items.length === 0 && <p className="space-empty">Cargando…</p>}
          {state === "error" && (
            <p role="alert" className="space-msg">
              {error}
            </p>
          )}
          {state === "ok" && items.length === 0 && <p className="space-empty">{kind === "followers" ? "Todavía nadie la sigue." : "Todavía no sigue a nadie."}</p>}
          <ul className="space-people">
            {items.map((p) => (
              <li key={p.username}>
                <a href={`/@${p.username}`} className="space-person">
                  <span className="space-person-av">
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por /s
                      <img src={p.avatarUrl} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true">{p.displayName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="space-person-t">
                    <b>@{p.username}</b>
                    <small>{p.displayName}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {more && (
            <button type="button" className="space-btn" onClick={() => setPage((n) => n + 1)}>
              Ver más
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Seguidores y seguidos de un Space, con el botón de seguir. Sin sesión, el botón lleva a entrar; el dueño ve sus números sin botón.
 * Actualiza el contador al momento y lo corrige con lo que responde el servidor.
 */
export function SpaceFollow({
  username,
  initial,
  viewerFollows,
  viewerSignedIn,
  isOwner,
  interactive,
}: {
  username: string;
  initial: { followers: number; following: number };
  viewerFollows: boolean;
  viewerSignedIn: boolean;
  isOwner: boolean;
  interactive: boolean;
}) {
  const [counts, setCounts] = useState(initial);
  const [following, setFollowing] = useState(viewerFollows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<"followers" | "following" | null>(null);

  const toggle = async () => {
    if (busy) return;
    const was = following;
    setBusy(true);
    setError(null);
    setFollowing(!was); // optimista
    setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (was ? -1 : 1)) }));
    try {
      const res = await fetch(was ? `/api/spaces/follow?username=${encodeURIComponent(username)}` : "/api/spaces/follow", {
        method: was ? "DELETE" : "POST",
        headers: was ? undefined : { "content-type": "application/json" },
        body: was ? undefined : JSON.stringify({ username }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; counts?: { followers: number; following: number } };
      if (!res.ok) throw new Error(body.error ?? "No se pudo completar.");
      if (body.counts) setCounts((c) => ({ ...c, followers: body.counts!.followers }));
    } catch (e) {
      setFollowing(was); // se deshace
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (was ? 1 : -1)) }));
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  };

  const n = (v: number) => new Intl.NumberFormat("es-CO").format(v);
  return (
    <div className="space-follow">
      <ul className="space-counts" aria-label="Seguidores y seguidos">
        <li>
          <button type="button" className="space-count" onClick={() => setList("followers")} disabled={!interactive} aria-haspopup="dialog">
            <b>{n(counts.followers)}</b> {counts.followers === 1 ? "seguidor" : "seguidores"}
          </button>
        </li>
        <li>
          <button type="button" className="space-count" onClick={() => setList("following")} disabled={!interactive} aria-haspopup="dialog">
            <b>{n(counts.following)}</b> siguiendo
          </button>
        </li>
      </ul>
      {interactive && !isOwner &&
        (viewerSignedIn ? (
          <button type="button" className="space-btn" data-following={following} aria-pressed={following} disabled={busy} onClick={() => void toggle()}>
            {following ? "Siguiendo ✓" : "Seguir"}
          </button>
        ) : (
          <Link href="/spaces/entrar" className="space-btn">
            Seguir
          </Link>
        ))}
      {error && (
        <p role="alert" className="space-msg">
          {error}
        </p>
      )}
      {list && <FollowListDialog username={username} kind={list} onClose={() => setList(null)} />}
    </div>
  );
}

const REASONS: [string, string][] = [
  ["spam", "Spam o publicidad"],
  ["ofensivo", "Contenido ofensivo"],
  ["suplantacion", "Suplanta a otra persona"],
  ["derechos", "Usa contenido sin permiso"],
  ["otro", "Otro motivo"],
];

/** Acciones del perfil: editar (dueño), compartir y reportar. */
export function SpaceActions({ username, isOwner, isDraft, staffAdmin = false }: { username: string; isOwner: boolean; isDraft: boolean; staffAdmin?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("spam");
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const share = async () => {
    const url = `${location.origin}/@${username}`;
    try {
      if (navigator.share) await navigator.share({ title: `@${username} en StereoFace Spaces`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelado */
    }
  };

  const send = async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/spaces/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, reason, detail: detail || undefined }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? "Gracias. Revisaremos este perfil." : (body.error ?? "No se pudo enviar el reporte."));
      if (res.ok) setReporting(false);
    } catch {
      setMsg("No se pudo enviar el reporte. Revisa tu conexión.");
    }
  };

  return (
    <div className="space-actions">
      {isOwner && (
        <Link href="/spaces/editar" className="space-btn">
          {Icon.pencil()} Editar perfil
        </Link>
      )}
      {isDraft && <span className="space-pill">Borrador: solo tú lo ves</span>}
      <button type="button" className="space-btn space-btn-icon" onClick={() => void share()} aria-label={copied ? "Enlace copiado" : "Compartir este Space"} title={copied ? "¡Enlace copiado!" : "Compartir"}>
        {copied ? "✓" : Icon.share()}
      </button>
      {(!isOwner || staffAdmin) && (
        <div className="relative">
          <button type="button" className="space-btn space-btn-icon" aria-haspopup="menu" aria-expanded={menu} aria-label="Más opciones" onClick={() => setMenu(!menu)}>
            {Icon.more()}
          </button>
          {menu && (
            <div role="menu" className="space-menu">
              {staffAdmin && (
                <Link href="/admin" role="menuitem" className="space-menu-link">
                  Ir al administrador
                </Link>
              )}
              {!isOwner && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setReporting(true);
                    setMenu(false);
                  }}
                >
                  Reportar este perfil
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {reporting && (
        <form
          className="space-report"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label>
            Motivo
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Detalle (opcional)
            <textarea value={detail} maxLength={300} rows={3} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="space-btn">
              Enviar reporte
            </button>
            <button type="button" className="space-btn" onClick={() => setReporting(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {msg && (
        <p role="status" className="space-msg">
          {msg}
        </p>
      )}
    </div>
  );
}

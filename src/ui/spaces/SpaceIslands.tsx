"use client";

import Link from "next/link";
import { useState } from "react";
import { useRadio } from "@/ui/radio/RadioProvider";

/** Botón para escuchar StereoFace Radio desde el Space. Reutiliza el reproductor global: nunca arranca solo. */
export function SpaceRadio() {
  const r = useRadio();
  const playing = r.status === "playing" || r.status === "loading" || r.status === "reconnecting";
  return (
    <div className="space-radio">
      <button type="button" className="space-play" onClick={() => r.toggle()} aria-pressed={playing} aria-label={playing ? "Pausar StereoFace Radio" : "Escuchar StereoFace Radio"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0">
        <p className="space-radio-name">
          StereoFace Radio {playing && <span className="space-live">EN VIVO</span>}
        </p>
        <p className="space-radio-sub">{r.current ? r.current.name : "Toca para escuchar"}</p>
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
          <b>{n(counts.followers)}</b> {counts.followers === 1 ? "seguidor" : "seguidores"}
        </li>
        <li>
          <b>{n(counts.following)}</b> siguiendo
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
export function SpaceActions({ username, isOwner, isDraft }: { username: string; isOwner: boolean; isDraft: boolean }) {
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
          ✎ Editar perfil
        </Link>
      )}
      {isDraft && <span className="space-pill">Borrador: solo tú lo ves</span>}
      <button type="button" className="space-btn" onClick={() => void share()} aria-label="Compartir este Space">
        {copied ? "Enlace copiado ✓" : "Compartir"}
      </button>
      {!isOwner && (
        <div className="relative">
          <button type="button" className="space-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Más opciones" onClick={() => setMenu(!menu)}>
            ⋯
          </button>
          {menu && (
            <div role="menu" className="space-menu">
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

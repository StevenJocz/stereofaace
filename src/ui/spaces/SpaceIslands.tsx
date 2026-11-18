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

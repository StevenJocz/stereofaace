"use client";

import type { LiveState } from "./engine/webcast";

const LABEL: Record<LiveState, string> = {
  offline: "Desconectado (suena el AutoDJ)",
  connecting: "Conectando…",
  live: "EN VIVO",
  reconnecting: "Reconectando…",
  "auth-error": "Usuario o contraseña incorrectos",
  error: "Error de conexión",
};

/** Barra de estado inferior (como la de ZaraStudio): estado de la emisión, DJ, programa y tamaño de la lista. */
export function StatusBar({ live, dj, program, queueCount, active }: { live: LiveState; dj: string; program: string | null; queueCount: number; active: string }) {
  return (
    <footer className="zs-status" aria-label="Estado del estudio">
      <span data-state={live} className="zs-status-live">
        <i aria-hidden="true" />
        {LABEL[live]}
      </span>
      <span>DJ: {dj || "—"}</span>
      <span>{program ? `Programa: ${program}` : "Sin programa elegido"}</span>
      <span>
        {queueCount} en lista · deck {active} al aire
      </span>
    </footer>
  );
}

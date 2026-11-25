"use client";

import { Mark } from "@/ui/Header";
import { formatClock, formatDayShort } from "./zara-format";
import { useClock } from "./ZaraWindow";

export type ToolId = "carts" | "line" | "midi" | "voice" | "chat" | "spotify" | "relay" | "camera" | "eq";

const I = {
  carts: <path d="M4 5h16v14H4zM4 10h16M10 5v14" />,
  line: <path d="M4 7h16v10H4zM8 11v2M12 10v4M16 11v2" />,
  midi: <path d="M4 6h16v12H4zM8 6v7M12 6v7M16 6v7M6 13h4M14 13h4" />,
  voice: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z" />,
  spotify: <path d="M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />,
  relay: <path d="M12 12v9M8 21h8M7.8 7.8a5.4 5.4 0 0 0 0 7.6M16.2 7.8a5.4 5.4 0 0 1 0 7.6M4.8 4.8a9.6 9.6 0 0 0 0 13.6M19.2 4.8a9.6 9.6 0 0 1 0 13.6M12 12.5a1 1 0 1 0 0-.01" />,
  camera: <path d="M4 7h3l1.5-2h7L17 7h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  eq: <path d="M5 4v16M12 4v16M19 4v16M3 9h4M10 15h4M17 8h4" />,
} as const;

/**
 * Barra superior del estudio: botones de herramientas (Cart Wall, voz, chat, Spotify, señal, cámara, ecualizador),
 * reloj con fecha y marca. Las herramientas se abren en una ventana flotante sobre la consola.
 */
export function StudioToolbar({
  tool,
  onTool,
  hot,
  extras,
}: {
  tool: ToolId | null;
  onTool: (t: ToolId | null) => void;
  /** Herramientas con actividad (micrófono abierto, cámara en directo…): llevan un punto. */
  hot: ReadonlySet<ToolId>;
  /** Botones propios al final de la fila (p. ej. atajos). */
  extras?: React.ReactNode;
}) {
  const now = useClock(1000);
  const tools: [ToolId, string][] = [
    ["carts", "Cart Wall"],
    ["voice", "Voz"],
    ["line", "Consola"],
    ["midi", "Controlador"],
    ["chat", "Chat"],
    ["spotify", "Spotify"],
    ["relay", "Señal"],
    ["camera", "Cámara"],
    ["eq", "Ecualizador"],
  ];
  return (
    <div className="zs-toolbar" role="toolbar" aria-label="Herramientas del estudio">
      <div className="zs-tools">
        {tools.map(([id, label]) => (
          <button key={id} type="button" className="zs-tool" aria-pressed={tool === id} data-hot={hot.has(id) || undefined} onClick={() => onTool(tool === id ? null : id)} title={label}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {I[id]}
            </svg>
            <span>{label}</span>
          </button>
        ))}
        {extras}
      </div>
      <div className="zs-brand">
        <div className="zs-clock" aria-label="Hora de la radio">
          <strong>{now ? formatClock(now) : "--:--:--"}</strong>
          <span>{now ? formatDayShort(now) : ""}</span>
        </div>
        <div className="zs-logo" aria-hidden="true">
          <Mark size={34} />
          <span className="display-wide">
            Stereo<span className="text-accent-ink">Studio</span>
          </span>
        </div>
      </div>
    </div>
  );
}

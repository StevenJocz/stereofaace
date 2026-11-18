"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Network } from "@/modules/spaces/public";

const W = 100;
const H = 84;
/** Mínimo de «lugares» en la red: si hay menos Spaces reales, el resto se muestra como espacio libre (nunca perfiles inventados). */
const MIN_SLOTS = 5;

type Pos = { x: number; y: number };

/** Posiciones deterministas en dos anillos alrededor del centro (el «hub» de invitación). */
function layout(count: number): Pos[] {
  const inner = Math.min(count, 5);
  const outer = count - inner;
  const out: Pos[] = [];
  for (let i = 0; i < inner; i++) {
    const a = ((-90 + (360 / inner) * i + (inner === 5 ? 0 : 18)) * Math.PI) / 180;
    out.push({ x: W / 2 + 27 * Math.cos(a), y: H / 2 + 24 * Math.sin(a) });
  }
  for (let i = 0; i < outer; i++) {
    const a = ((-90 + (360 / Math.max(outer, 1)) * i + 36) * Math.PI) / 180;
    out.push({ x: W / 2 + 43 * Math.cos(a), y: H / 2 + 37 * Math.sin(a) });
  }
  return out;
}

const curve = (a: Pos, b: Pos) => {
  // Curva suave hacia el centro para que las conexiones no sean rectas aburridas.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx + (W / 2 - mx) * 0.35;
  const cy = my + (H / 2 - my) * 0.35;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

/**
 * «Red de amigos» de la portada: los Spaces públicos como nodos que flotan, unidos por los seguimientos reales entre ellos,
 * con la invitación a crear el propio en el centro. Decorativa para el lector de pantalla: la lista de enlaces es la accesible.
 */
export function SpacesNetwork({ network, ctaHref, signedIn }: { network: Network; ctaHref: string; signedIn: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const slots = Math.max(MIN_SLOTS, network.nodes.length);
  const pos = useMemo(() => layout(slots), [slots]);
  const byUser = useMemo(() => new Map(network.nodes.map((n, i) => [n.username, pos[i]])), [network.nodes, pos]);
  const activeNode = network.nodes.find((n) => n.username === active) ?? null;

  return (
    <div className="net" data-active={active ? "true" : undefined}>
      <svg className="net-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <circle className="net-orbit net-orbit-a" cx={W / 2} cy={H / 2} r="27" />
        <circle className="net-orbit net-orbit-b" cx={W / 2} cy={H / 2} r="42" />
        {pos.map((p, i) => (
          <line key={`h${i}`} className={`net-hub ${i >= network.nodes.length ? "is-free" : ""}`} x1={W / 2} y1={H / 2} x2={p.x} y2={p.y} />
        ))}
        {network.edges.map((e, i) => {
          const a = byUser.get(e.from);
          const b = byUser.get(e.to);
          if (!a || !b) return null;
          const d = curve(a, b);
          const on = active === e.from || active === e.to;
          return (
            <g key={`${e.from}>${e.to}`} className="net-edge" data-on={on || undefined}>
              <path d={d} />
              <circle className="net-packet" r="0.9">
                <animateMotion dur={`${3.2 + (i % 4) * 0.7}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}
      </svg>

      <Link href={ctaHref} className="net-me" style={{ left: "50%", top: `${(H / 2 / H) * 100}%` }}>
        <span className="net-me-ring" aria-hidden="true" />
        <span className="net-me-core">
          <span className="net-me-plus" aria-hidden="true">
            +
          </span>
          <span className="display-up net-me-label">{signedIn ? "Tu Space" : "Tu Space aquí"}</span>
        </span>
      </Link>

      <ul className="net-nodes" aria-label="Spaces de la comunidad">
        {pos.map((p, i) => {
          const n = network.nodes[i];
          const style = { left: `${p.x}%`, top: `${(p.y / H) * 100}%`, ["--d" as string]: `${(i * 0.9) % 5}s`, ["--t" as string]: `${5 + (i % 3)}s` };
          if (!n) {
            return (
              <li key={`free${i}`} className="net-node net-free" style={style}>
                <Link href={ctaHref} tabIndex={-1} aria-hidden="true">
                  <span className="net-av net-av-free">?</span>
                  <span className="net-name">libre</span>
                </Link>
              </li>
            );
          }
          const size = 46 + Math.min(n.followers ?? 0, 20) * 1.1;
          return (
            <li key={n.username} className="net-node" style={{ ...style, ["--s" as string]: `${size}px` }} data-featured={n.featured || undefined} data-on={active === n.username || undefined}>
              <Link href={`/@${n.username}`} onMouseEnter={() => setActive(n.username)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(n.username)} onBlur={() => setActive(null)}>
                <span className="net-av">
                  {n.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s
                    <img src={n.avatarUrl} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">{n.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
                <span className="net-name">@{n.username}</span>
                <span className="sr-only">
                  {n.displayName}
                  {n.genres.length ? `, ${n.genres.join(", ")}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="net-tip mono" aria-hidden="true">
        {activeNode ? (
          <>
            <b>{activeNode.displayName}</b>
            {activeNode.genres.length > 0 && <span> · {activeNode.genres.join(" · ")}</span>}
            {activeNode.followers !== null && (
              <span>
                {" "}
                · {activeNode.followers} {activeNode.followers === 1 ? "seguidor" : "seguidores"}
              </span>
            )}
          </>
        ) : network.edges.length > 0 ? (
          "Cada línea es alguien siguiendo a otra persona"
        ) : (
          "Tu Space se conecta con el resto de la comunidad"
        )}
      </p>
    </div>
  );
}

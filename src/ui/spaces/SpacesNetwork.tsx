"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Network } from "@/modules/spaces/public";

const W = 100;
const H = 84;
/** Mínimo de «lugares» en la red: si hay menos Spaces reales, el resto se muestra como espacio libre (nunca perfiles inventados). */
const MIN_SLOTS = 5;

type Pos = { x: number; y: number };

/**
 * Posiciones deterministas en dos anillos alrededor del centro (el «hub» de invitación). Los nodos del anillo exterior se colocan
 * entre dos del interior —nunca detrás de uno— para que ninguna foto tape a otra.
 */
function layout(count: number): Pos[] {
  const inner = Math.min(count, 5);
  const outer = count - inner;
  const out: Pos[] = [];
  const innerAngles = Array.from({ length: inner }, (_, i) => -90 + (360 / inner) * i + (inner === 5 ? 0 : 18));
  for (const deg of innerAngles) {
    const a = (deg * Math.PI) / 180;
    out.push({ x: W / 2 + 25 * Math.cos(a), y: H / 2 + 22 * Math.sin(a) });
  }
  // Puntos medios entre nodos interiores consecutivos; con menos nodos exteriores se reparten de forma simétrica.
  const mids = innerAngles.map((d) => d + 360 / inner / 2);
  for (let j = 0; j < outer; j++) {
    const deg = outer <= mids.length ? mids[Math.round((j * mids.length) / outer) % mids.length] : -90 + (360 / outer) * j + 36;
    const a = (deg * Math.PI) / 180;
    out.push({ x: W / 2 + 43 * Math.cos(a), y: H / 2 + 37 * Math.sin(a) });
  }
  return out;
}

const curve = (a: Pos, b: Pos) => {
  // Curva suave hacia el centro para que las conexiones no sean rectas aburridas.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx + (W / 2 - mx) * 0.22;
  const cy = my + (H / 2 - my) * 0.22;
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
  // Un seguimiento mutuo es una sola línea: A→B y B→A se dibujaban una encima de la otra.
  const links = useMemo(() => {
    const seen = new Set<string>();
    return network.edges.filter((e) => {
      const key = [e.from, e.to].sort().join("|");
      if (e.from === e.to || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [network.edges]);
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!active) return set;
    for (const e of network.edges) {
      if (e.from === active) set.add(e.to);
      if (e.to === active) set.add(e.from);
    }
    return set;
  }, [active, network.edges]);

  return (
    <div className="net" data-active={active ? "true" : undefined}>
      <svg className="net-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <circle className="net-orbit" cx={W / 2} cy={H / 2} r="43" />
        {links.map((e, i) => {
          const a = byUser.get(e.from);
          const b = byUser.get(e.to);
          if (!a || !b) return null;
          const d = curve(a, b);
          const on = active === e.from || active === e.to;
          return (
            <g key={`${e.from}>${e.to}`} className="net-edge" data-on={on || undefined}>
              <path d={d} />
              {on && (
                <circle className="net-packet" r="0.8">
                  <animateMotion dur={`${2.6 + (i % 3) * 0.6}s`} repeatCount="indefinite" path={d} />
                </circle>
              )}
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
          const size = 44 + Math.min(n.followers ?? 0, 20) * 0.6;
          return (
            <li key={n.username} className="net-node" style={{ ...style, ["--s" as string]: `${size}px` }} data-featured={n.featured || undefined} data-on={active === n.username || undefined} data-dim={(active && active !== n.username && !neighbors.has(n.username)) || undefined}>
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
            {neighbors.size > 0 && (
              <span>
                {" "}
                · {neighbors.size} {neighbors.size === 1 ? "conexión" : "conexiones"}
              </span>
            )}
            {activeNode.followers !== null && (
              <span>
                {" "}
                · {activeNode.followers} {activeNode.followers === 1 ? "seguidor" : "seguidores"}
              </span>
            )}
          </>
        ) : links.length > 0 ? (
          "Las líneas son seguimientos entre personas"
        ) : (
          "Tu Space se conecta con el resto de la comunidad"
        )}
      </p>
    </div>
  );
}

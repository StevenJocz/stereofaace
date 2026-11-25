"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Mark } from "@/ui/Header";
import type { Network, NetworkNode } from "@/modules/spaces/public";

const W = 100;
const H = 84;
/** Mínimo de «lugares» en la red: si hay menos Spaces reales, el resto se muestra como espacio libre (nunca perfiles inventados). */
const MIN_SLOTS = 5;

type Pos = { x: number; y: number };
type Ring = { rx: number; ry: number; /** grados por segundo (negativo = al revés) */ dps: number };
type Slot = { ring: Ring; deg: number };

const R_MIN = 16;
const R_MAX = 44;
const ASPECT = 0.84;
/** Más de esto en pantalla y los nombres solo aparecen al señalar (si no, tapan a los demás). */
const DENSE_AFTER = 12;
/** Tope de hilos dibujados a la vez: con muchos seguimientos la red volvería a saturarse. */
const MAX_LINKS = 90;

/**
 * Anillos concéntricos que giran en sentidos contrarios (los de fuera, más despacio). Cada anillo lleva varias personas
 * repartidas a distancias iguales —al girar juntas nunca se pisan—, en proporción a su perímetro. Los verificados y quienes
 * tienen más seguidores van en los anillos de dentro; los lugares «libre» ocupan los de fuera.
 */
function layout(nodes: NetworkNode[], count: number): Slot[] {
  const rings = Math.min(6, Math.max(3, Math.ceil(count / 6)));
  const radii = Array.from({ length: rings }, (_, k) => R_MIN + ((R_MAX - R_MIN) * k) / (rings - 1));
  // Cuántas personas lleva cada anillo: proporcional a su radio (método del mayor resto).
  const total = radii.reduce((a, b) => a + b, 0);
  const exact = radii.map((r) => (count * r) / total);
  const per = exact.map(Math.floor);
  let left = count - per.reduce((a, b) => a + b, 0);
  [...exact.keys()].sort((a, b) => exact[b] - per[b] - (exact[a] - per[a])).forEach((k) => left-- > 0 && per[k]++);
  const order = nodes.map((_, i) => i).sort((a, b) => Number(nodes[b].verified) - Number(nodes[a].verified) || (nodes[b].followers ?? 0) - (nodes[a].followers ?? 0) || a - b);
  for (let i = nodes.length; i < count; i++) order.push(i);
  const slots: Slot[] = new Array(count);
  let cursor = 0;
  radii.forEach((rx, k) => {
    const f = rings > 1 ? k / (rings - 1) : 0;
    const ring: Ring = { rx, ry: rx * ASPECT, dps: (k % 2 === 0 ? 1 : -1) * (4.6 - 2.4 * f) };
    for (let j = 0; j < per[k]; j++) slots[order[cursor++]] = { ring, deg: -90 + k * 37 + (360 / per[k]) * j };
  });
  return slots;
}

/** Dónde está ese lugar tras `t` segundos de giro. */
function posAt(slot: Slot, t: number): Pos {
  const a = ((slot.deg + slot.ring.dps * t) * Math.PI) / 180;
  return { x: W / 2 + slot.ring.rx * Math.cos(a), y: H / 2 + slot.ring.ry * Math.sin(a) };
}

const curve = (a: Pos, b: Pos) => {
  // Curva suave hacia el centro para que las conexiones no sean rectas aburridas.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx + (W / 2 - mx) * 0.12;
  const cy = my + (H / 2 - my) * 0.12;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

/**
 * «Red de amigos» de la portada: los Spaces públicos giran como satélites (un anillo cada uno) alrededor del logo de StereoFace.
 * Sus seguimientos reales entre ellos aparecen como hilos finos al señalar a alguien. Decorativa para el lector de pantalla:
 * la lista de enlaces es la accesible.
 */
export function SpacesNetwork({ network, ctaHref }: { network: Network; ctaHref: string }) {
  const [active, setActive] = useState<string | null>(null);
  const count = Math.max(MIN_SLOTS, network.nodes.length);
  const slots = useMemo(() => layout(network.nodes, count), [network.nodes, count]);
  const rings = useMemo(() => [...new Set(slots.map((sl) => sl.ring))], [slots]); // un anillo lleva a varias personas
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<(HTMLLIElement | null)[]>([]);
  const pathEls = useRef<(SVGPathElement | null)[]>([]);
  const t = useRef(0);
  const activeRef = useRef<string | null>(null);
  const indexOf = useMemo(() => new Map(network.nodes.map((n, i) => [n.username, i])), [network.nodes]);
  // Las posiciones del primer dibujo; después el giro mueve los elementos directamente (sin volver a dibujar el componente).
  const pos0 = useMemo(() => slots.map((sl) => posAt(sl, 0)), [slots]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const activeNode = network.nodes.find((n) => n.username === active) ?? null;
  // Un seguimiento mutuo es una sola línea: A→B y B→A se dibujaban una encima de la otra.
  const links = useMemo(() => {
    const seen = new Set<string>();
    return network.edges.filter((e) => {
      const key = [e.from, e.to].sort().join("|");
      if (e.from === e.to || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_LINKS);
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

  // El giro: cada fotograma recoloca los nodos y las líneas. Se detiene al señalar a alguien, fuera de pantalla y con «reducir movimiento».
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(root);
    const apply = () => {
      const now = slots.map((sl) => posAt(sl, t.current));
      now.forEach((p, i) => {
        const el = nodeEls.current[i];
        if (el) {
          el.style.left = `${p.x}%`;
          el.style.top = `${(p.y / H) * 100}%`;
        }
      });
      links.forEach((e, i) => {
        const a = indexOf.get(e.from);
        const b = indexOf.get(e.to);
        if (a === undefined || b === undefined) return;
        pathEls.current[i]?.setAttribute("d", curve(now[a], now[b]));
      });
    };
    let raf = 0;
    let last = performance.now();
    const frame = (time: number) => {
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;
      if (visible && !activeRef.current) {
        t.current += dt;
        apply();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [slots, links, indexOf]);

  return (
    <div ref={rootRef} className="net" data-active={active ? "true" : undefined} data-dense={network.nodes.length > DENSE_AFTER || undefined}>
      <svg className="net-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        {rings.map((r) => (
          <ellipse key={r.rx} className="net-orbit" cx={W / 2} cy={H / 2} rx={r.rx} ry={r.ry} />
        ))}
        {links.map((e, i) => {
          const a = indexOf.get(e.from);
          const b = indexOf.get(e.to);
          if (a === undefined || b === undefined) return null;
          const on = active === e.from || active === e.to;
          return (
            <g key={`${e.from}>${e.to}`} className="net-edge" data-on={on || undefined}>
              <path id={`${uid}e${i}`} ref={(el) => void (pathEls.current[i] = el)} d={curve(pos0[a], pos0[b])} />
              {on && (
                <circle className="net-packet" r="0.3">
                  <animateMotion dur={`${2.6 + (i % 3) * 0.6}s`} repeatCount="indefinite">
                    <mpath href={`#${uid}e${i}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      <div className="net-me" style={{ left: "50%", top: `${(H / 2 / H) * 100}%` }} aria-hidden="true">
        <span className="net-me-ring" />
        <span className="net-me-core">
          <span className="net-vinyl">
            <Mark size={120} className="net-logo" />
          </span>
          <span className="net-vinyl-shine" />
        </span>
      </div>

      <ul className="net-nodes" aria-label="Spaces de la comunidad">
        {pos0.map((p, i) => {
          const n = network.nodes[i];
          const style = { left: `${p.x}%`, top: `${(p.y / H) * 100}%` };
          if (!n) {
            return (
              <li key={`free${i}`} ref={(el) => void (nodeEls.current[i] = el)} className="net-node net-free" style={style}>
                <Link href={ctaHref} tabIndex={-1} aria-hidden="true">
                  <span className="net-av net-av-free">?</span>
                  <span className="net-name">libre</span>
                </Link>
              </li>
            );
          }
          const size = 6.2 + Math.min(n.followers ?? 0, 20) * 0.05; // en unidades del lienzo (1 = 1 % del ancho)
          return (
            <li key={n.username} ref={(el) => void (nodeEls.current[i] = el)} className="net-node" style={{ ...style, ["--s" as string]: size }} data-featured={n.featured || undefined} data-on={active === n.username || undefined} data-dim={(active && active !== n.username && !neighbors.has(n.username)) || undefined}>
              <Link href={`/@${n.username}`} onMouseEnter={() => setActive(n.username)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(n.username)} onBlur={() => setActive(null)}>
                <span className="net-avw">
                  <span className="net-av">
                    {n.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s
                      <img src={n.avatarUrl} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true">{n.displayName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  {n.verified && (
                    <svg className="net-check" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="8" />
                      <path d="M4.6 8.3l2.2 2.2 4.6-4.8" />
                    </svg>
                  )}
                </span>
                <span className="net-name">@{n.username}</span>
                <span className="sr-only">
                  {n.displayName}
                  {n.verified ? ", verificado" : ""}
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
            {activeNode.verified && <span> · verificado</span>}
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
        ) : (
          "Los verificados y con más seguidores, más cerca del centro"
        )}
      </p>
    </div>
  );
}

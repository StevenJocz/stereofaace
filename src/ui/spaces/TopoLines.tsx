/**
 * Líneas topográficas (curvas de nivel) generadas con senos: decorativas, deterministas (sin aleatorios, para que el render
 * del servidor y el del cliente coincidan) y con una deriva lenta que se apaga con `prefers-reduced-motion`.
 */
const W = 400;
const H = 150;
const LINES = 22;

function path(k: number): string {
  const pts: string[] = [];
  for (let x = -10; x <= W + 10; x += 8) {
    const t = x / W;
    // Una «montaña» suave a la derecha que empuja las líneas hacia arriba, más dos ondas para el relieve.
    const hill = 34 * Math.exp(-(((t - 0.72) / 0.22) ** 2));
    const y = 8 + k * 6.4 - hill * (1 - k / (LINES * 1.3)) + 5 * Math.sin(t * 9 + k * 0.28) + 3 * Math.sin(t * 17 - k * 0.5);
    pts.push(`${x === -10 ? "M" : "L"}${x} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export function TopoLines() {
  return (
    <svg className="topo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g className="topo-drift">
        {Array.from({ length: LINES }, (_, k) => (
          <path key={k} d={path(k)} style={{ opacity: 0.35 + (k % 5) * 0.13 }} />
        ))}
      </g>
    </svg>
  );
}

/** Mira (crosshair) decorativa. */
export function Crosshair() {
  return (
    <svg className="topo-cross" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 1v6M12 17v6M1 12h6M17 12h6" />
    </svg>
  );
}

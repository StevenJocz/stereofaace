type Props = { value: string; className?: string };

/** Código de barras decorativo derivado de un texto (número de edición). No es un código escaneable. */
export function Barcode({ value, className }: Props) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < 46; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 1 + ((h >>> 0) % 4);
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 ${x} 40`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Edición ${value}`}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}

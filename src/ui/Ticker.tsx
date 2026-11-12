type Props = { items: string[]; className?: string };

/** Ticker horizontal en CSS puro. Se detiene con prefers-reduced-motion y al pasar el cursor. */
export function Ticker({ items, className = "" }: Props) {
  const row = (hidden: boolean) => (
    <span aria-hidden={hidden || undefined} className="inline-flex items-center">
      {items.map((t, i) => (
        <span key={i} className="inline-flex items-center">
          <span className="px-6">{t}</span>
          <span className="opacity-60">→</span>
        </span>
      ))}
    </span>
  );
  return (
    <div className={`ticker ${className}`}>
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

"use client";

/** Barra de nivel de −60 a 0 dB; rojo desde −3 dB (cerca del limitador). */
export function MeterBar({ db, label, className = "" }: { db: number; label: string; className?: string }) {
  const pct = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
  const hot = db > -3;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={Math.round(Math.max(-60, db))}
      className={`studio-meter ${className}`}
    >
      <div className="studio-meter-fill" data-hot={hot} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

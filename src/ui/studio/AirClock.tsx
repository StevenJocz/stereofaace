"use client";

import { useEffect, useState } from "react";
import { airTimeLeft } from "./engine/countdown";

/** Cuenta regresiva «te quedan HH:MM:SS al aire»; se dibuja sola cada segundo. */
export function AirClock({ endsAt, className = "" }: { endsAt: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  const left = airTimeLeft(endsAt, now);
  if (!left) return null;
  const color = left.level === "urgent" ? "text-[#ff6b6b]" : left.level === "warn" ? "text-[#ffd23f]" : "text-accent-ink";
  return (
    <span className={`mono ${color} ${className}`} role="timer" aria-label={`Te quedan ${left.text} al aire`}>
      Te quedan {left.text}
    </span>
  );
}

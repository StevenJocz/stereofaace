"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AirClock } from "./AirClock";
import { liveStore, serverIdle } from "./live-store";

/** Barra fija del panel mientras hay una transmisión en vivo y no estás en la consola. */
export function OnAirBar() {
  const info = useSyncExternalStore(liveStore.subscribe, liveStore.get, serverIdle);
  const pathname = usePathname();
  if (!info.live || pathname === "/admin/radio/studio") return null;
  return (
    <div className="onair-bar" role="status">
      <span className="onair-dot" aria-hidden="true" />
      <strong className="display-up">En vivo</strong>
      {info.program && <span className="truncate text-muted">{info.program}</span>}
      <AirClock endsAt={info.endsAt} className="whitespace-nowrap" />
      <span className="ml-auto flex items-center gap-2">
        <Link href="/admin/radio/studio" className="btn !px-3 !py-1">
          Volver al estudio
        </Link>
        <button type="button" className="btn !px-3 !py-1" onClick={() => liveStore.requestStop()}>
          Desconectar
        </button>
      </span>
    </div>
  );
}

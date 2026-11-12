"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { StudioConsole, type RelayInfo } from "./StudioConsole";

/**
 * La consola vive en el layout del panel: al navegar a otra sección se oculta pero NO se desmonta,
 * así la transmisión, el micrófono y las pistas siguen sonando hasta que el DJ se desconecte.
 */
export function PersistentStudio({ relay }: { relay: RelayInfo }) {
  const pathname = usePathname();
  const onStudio = pathname === "/admin/radio/studio";
  const [started, setStarted] = useState(onStudio);
  if (onStudio && !started) setStarted(true);

  // Al volver, la consola recalcula su alto (estando oculta no podía medirse).
  useEffect(() => {
    if (onStudio) window.dispatchEvent(new Event("resize"));
  }, [onStudio]);

  if (!started) return null;
  return (
    <div hidden={!onStudio}>
      <StudioConsole relay={relay} visible={onStudio} />
    </div>
  );
}

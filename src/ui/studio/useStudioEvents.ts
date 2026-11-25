"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventInput, EventView } from "@/modules/studio/events";

export type EventsState = "loading" | "ready" | "error";
export type EventResult = { ok: true } | { ok: false; error: string };

async function send(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<EventResult> {
  try {
    const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (r.ok) return { ok: true };
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: d?.error ?? "No se pudo guardar. Inténtalo de nuevo." };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

/** Eventos del programador: se leen al abrir la consola y cada minuto (otro DJ pudo cambiarlos). Tras guardar o borrar se recargan. */
export function useStudioEvents(active: boolean) {
  const [events, setEvents] = useState<EventView[]>([]);
  const [state, setState] = useState<EventsState>("loading");

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/studio/events", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setEvents((await r.json()) as EventView[]);
      setState("ready");
    } catch {
      setState((s) => (s === "ready" ? s : "error")); // con datos ya cargados se conservan
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => void reload(), 0);
    const t = setInterval(() => void reload(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active, reload]);

  const save = useCallback(
    async (input: EventInput, id?: string): Promise<EventResult> => {
      const r = id ? await send(`/api/studio/events/${id}`, "PUT", input) : await send("/api/studio/events", "POST", input);
      if (r.ok) await reload();
      return r;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string): Promise<EventResult> => {
      const r = await send(`/api/studio/events/${id}`, "DELETE");
      if (r.ok) await reload();
      return r;
    },
    [reload],
  );

  return { events, state, reload, save, remove };
}

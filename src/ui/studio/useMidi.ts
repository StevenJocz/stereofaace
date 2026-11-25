"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MIDI_ACTIONS, applyLearn, bindKey, describeKey, learnable, parseMidi, parseStoredMap, removeBinding, resolveMidi, type MidiEvent, type MidiMap } from "./engine/midi";

const MAP_KEY = "sf-studio-midi";
const ON_KEY = "sf-studio-midi-on";

export type MidiStatus = "unsupported" | "idle" | "asking" | "ready" | "denied" | "error";

// Tipos mínimos de Web MIDI (no vienen en todas las versiones de TypeScript).
type MidiMessageEventLike = { data: Uint8Array | null };
type MidiInputLike = { id: string; name: string | null; state: string; onmidimessage: ((e: MidiMessageEventLike) => void) | null };
type MidiAccessLike = { inputs: { forEach(cb: (i: MidiInputLike) => void): void }; onstatechange: (() => void) | null };

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: vale solo para esta visita */
  }
}

/**
 * Conexión con un controlador MIDI del DJ (consola de DJ, mezclador con USB, pads). Lee sus mensajes, los traduce a acciones del
 * estudio con el mapa guardado y permite «aprender»: se elige una acción, se toca el control y queda vinculado.
 * Solo Chrome y Edge (Web MIDI), con la página en HTTPS y el permiso del navegador.
 */
export function useMidi(onEvent: (ev: MidiEvent) => void) {
  const supported = typeof navigator !== "undefined" && typeof (navigator as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess === "function";
  const [status, setStatus] = useState<MidiStatus>(supported ? "idle" : "unsupported");
  const [inputs, setInputs] = useState<string[]>([]);
  const [map, setMapState] = useState<MidiMap>({});
  const [learning, setLearning] = useState<string | null>(null);
  const [last, setLast] = useState<{ key: string; text: string } | null>(null);
  const mapRef = useRef<MidiMap>({});
  const learningRef = useRef<string | null>(null);
  const onEventRef = useRef(onEvent);
  const accessRef = useRef<MidiAccessLike | null>(null);
  const lastAtRef = useRef(0);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const setMap = useCallback((m: MidiMap) => {
    mapRef.current = m;
    setMapState(m);
    store(MAP_KEY, JSON.stringify(m));
  }, []);

  const handle = useCallback(
    (e: MidiMessageEventLike) => {
      const msg = parseMidi(e.data);
      if (!msg) return;
      const key = bindKey(msg);
      const now = Date.now();
      if (now - lastAtRef.current > 80) {
        lastAtRef.current = now;
        setLast({ key, text: `${describeKey(key)} · ${msg.value}` });
      }
      const learningId = learningRef.current;
      if (learningId) {
        const action = MIDI_ACTIONS.find((a) => a.id === learningId);
        if (action && learnable(action, msg)) {
          learningRef.current = null;
          setLearning(null);
          setMap(applyLearn(mapRef.current, learningId, msg));
        }
        return; // aprendiendo, el control no dispara nada
      }
      const ev = resolveMidi(mapRef.current, msg);
      if (ev) onEventRef.current(ev);
    },
    [setMap],
  );

  const refreshInputs = useCallback(() => {
    const access = accessRef.current;
    if (!access) return;
    const names: string[] = [];
    access.inputs.forEach((i) => {
      if (i.state === "connected") {
        i.onmidimessage = handle;
        names.push(i.name || "Controlador MIDI");
      } else i.onmidimessage = null;
    });
    setInputs(names);
    // Un aparato desenchufado con el botón del micrófono apretado no puede dejar la voz abierta.
    if (names.length === 0) onEventRef.current({ action: "mic-ptt", kind: "hold", press: false, value: 0 });
  }, [handle]);

  const connect = useCallback(async () => {
    const req = (navigator as unknown as { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MidiAccessLike> }).requestMIDIAccess;
    if (!req) {
      setStatus("unsupported");
      return;
    }
    setStatus("asking");
    try {
      const access = await req.call(navigator, { sysex: false });
      accessRef.current = access;
      access.onstatechange = refreshInputs;
      refreshInputs();
      setStatus("ready");
      store(ON_KEY, "1");
    } catch (err) {
      setStatus(err instanceof DOMException && (err.name === "SecurityError" || err.name === "NotAllowedError") ? "denied" : "error");
    }
  }, [refreshInputs]);

  const disconnect = useCallback(() => {
    const access = accessRef.current;
    if (access) {
      access.onstatechange = null;
      access.inputs.forEach((i) => (i.onmidimessage = null));
    }
    accessRef.current = null;
    learningRef.current = null;
    setLearning(null);
    setInputs([]);
    setStatus("idle");
    store(ON_KEY, null);
    onEventRef.current({ action: "mic-ptt", kind: "hold", press: false, value: 0 });
  }, []);

  // Al abrir el estudio: vuelve el mapa guardado y, si ya estaba conectado, se reconecta solo.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const m = parseStoredMap(localStorage.getItem(MAP_KEY));
        mapRef.current = m;
        setMapState(m);
        if (supported && localStorage.getItem(ON_KEY) === "1") void connect();
      } catch {
        /* sin almacenamiento */
      }
    }, 0);
    return () => {
      clearTimeout(t);
      const access = accessRef.current;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((i) => (i.onmidimessage = null));
      }
    };
  }, [supported, connect]);

  const learn = useCallback((id: string | null) => {
    learningRef.current = id;
    setLearning(id);
  }, []);
  const unbind = useCallback((id: string) => setMap(removeBinding(mapRef.current, id)), [setMap]);
  const clearAll = useCallback(() => setMap({}), [setMap]);

  return { status, inputs, map, learning, last, connect, disconnect, learn, unbind, clearAll };
}

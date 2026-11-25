/**
 * Controladores MIDI (consolas de DJ, mezcladores y pads con USB): lectura de mensajes, mapa «control → acción» y aprendizaje.
 * Todo puro (sin navegador): la conexión con Web MIDI está en `useMidi`. Un control se identifica por tipo (nota o control),
 * canal y número; una acción es un botón, un deslizador (fader) o un botón de «mantener».
 */

export type MidiMsg = { kind: "note" | "cc"; /** 0–15 */ channel: number; number: number; /** 0–127 (una nota apagada vale 0) */ value: number };

/** Interpreta los bytes de un mensaje MIDI. Solo notas (encendido/apagado) y controles; el resto se ignora. */
export function parseMidi(data: ArrayLike<number> | null | undefined): MidiMsg | null {
  if (!data || data.length < 3) return null;
  const status = data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const number = data[1] & 0x7f;
  const value = data[2] & 0x7f;
  if (type === 0x90) return { kind: "note", channel, number, value };
  if (type === 0x80) return { kind: "note", channel, number, value: 0 };
  if (type === 0xb0) return { kind: "cc", channel, number, value };
  return null;
}

/** Identificador estable del control físico que mandó el mensaje. */
export const bindKey = (m: Pick<MidiMsg, "kind" | "channel" | "number">) => `${m.kind}:${m.channel}:${m.number}`;

/** «Nota 36 · canal 1» / «Control 7 · canal 1». */
export function describeKey(key: string): string {
  const m = /^(note|cc):(\d{1,2}):(\d{1,3})$/.exec(key);
  if (!m) return key;
  return `${m[1] === "note" ? "Nota" : "Control"} ${m[3]} · canal ${Number(m[2]) + 1}`;
}

/** ¿El mensaje es «pulsar»? (nota encendida o control con valor alto). Soltar es lo contrario. */
export const isPress = (m: MidiMsg) => (m.kind === "note" ? m.value > 0 : m.value >= 64);

export type MidiActionKind = "button" | "hold" | "fader";
export type MidiAction = { id: string; label: string; kind: MidiActionKind; group: string };

const L = "Lista principal";
const J = "Jingles";
const V = "Voz y mezcla";
const E = "Eventos y salida";

/** Todo lo que se puede vincular a un control del aparato. */
export const MIDI_ACTIONS: MidiAction[] = [
  { id: "play", label: "Play", kind: "button", group: L },
  { id: "pause", label: "Pausa", kind: "button", group: L },
  { id: "stop", label: "Stop", kind: "button", group: L },
  { id: "fade", label: "Siguiente con fundido", kind: "button", group: L },
  { id: "cut", label: "Siguiente en seco", kind: "button", group: L },
  { id: "restart", label: "Reiniciar la pista", kind: "button", group: L },
  { id: "vol-decks", label: "Volumen de los decks", kind: "fader", group: L },
  ...Array.from({ length: 9 }, (_, i): MidiAction => ({ id: `jingle-${i + 1}`, label: `Jingle ${i + 1}`, kind: "button", group: J })),
  { id: "carts-stop", label: "Detener todos los jingles", kind: "button", group: J },
  { id: "mic-toggle", label: "Micrófono: silenciar / hablar", kind: "button", group: V },
  { id: "mic-ptt", label: "Micrófono: hablar mientras se mantiene", kind: "hold", group: V },
  { id: "mic-gain", label: "Ganancia del micrófono", kind: "fader", group: V },
  { id: "vol-master", label: "Volumen master", kind: "fader", group: V },
  { id: "vol-line", label: "Volumen de la consola externa", kind: "fader", group: V },
  { id: "vol-ext", label: "Volumen de Spotify / señal externa", kind: "fader", group: V },
  { id: "event-next", label: "Ejecutar ya el próximo evento", kind: "button", group: E },
  { id: "scheduler-toggle", label: "Programador: pausar / reanudar", kind: "button", group: E },
  { id: "monitor-toggle", label: "Salida en silencio / escuchar", kind: "button", group: E },
];

export const actionById = (id: string): MidiAction | undefined => MIDI_ACTIONS.find((a) => a.id === id);

export type MidiMap = Record<string, string>; // clave del control → id de la acción

/** ¿Este mensaje sirve para vincular esa acción? Los botones aceptan pulsar (nota o control); los deslizadores, solo controles. */
export function learnable(action: MidiAction, msg: MidiMsg): boolean {
  return action.kind === "fader" ? msg.kind === "cc" : isPress(msg);
}

/** Vincula un control a una acción: cada acción tiene un solo control y cada control una sola acción. */
export function applyLearn(map: MidiMap, actionId: string, msg: MidiMsg): MidiMap {
  const key = bindKey(msg);
  const next: MidiMap = {};
  for (const [k, id] of Object.entries(map)) if (id !== actionId && k !== key) next[k] = id;
  next[key] = actionId;
  return next;
}

export function removeBinding(map: MidiMap, actionId: string): MidiMap {
  return Object.fromEntries(Object.entries(map).filter(([, id]) => id !== actionId));
}

/** Control vinculado a una acción (o null). */
export const keyOf = (map: MidiMap, actionId: string): string | null => Object.entries(map).find(([, id]) => id === actionId)?.[0] ?? null;

export type MidiEvent = { action: string; kind: MidiActionKind; /** Para botones: pulsar (true) o soltar (false). */ press: boolean; /** 0–1 (deslizadores) */ value: number };

/** Qué acción dispara un mensaje según el mapa, o null si ese control no está vinculado. */
export function resolveMidi(map: MidiMap, msg: MidiMsg): MidiEvent | null {
  const id = map[bindKey(msg)];
  const action = id ? actionById(id) : undefined;
  if (!action) return null;
  if (action.kind === "fader") return msg.kind === "cc" ? { action: id, kind: "fader", press: false, value: msg.value / 127 } : null;
  return { action: id, kind: action.kind, press: isPress(msg), value: msg.value / 127 };
}

/** Lee el mapa guardado descartando lo que no sea una vinculación válida (claves raras o acciones que ya no existen). */
export function parseStoredMap(raw: string | null): MidiMap {
  try {
    const v = JSON.parse(raw ?? "{}") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: MidiMap = {};
    const seen = new Set<string>();
    for (const [k, id] of Object.entries(v as Record<string, unknown>)) {
      if (typeof id !== "string" || !/^(note|cc):\d{1,2}:\d{1,3}$/.test(k) || !actionById(id) || seen.has(id)) continue;
      seen.add(id);
      out[k] = id;
    }
    return out;
  } catch {
    return {};
  }
}

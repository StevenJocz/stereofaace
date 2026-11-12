import { planCrossfade } from "./crossfade";
import type { DeckId } from "./audio-engine";
import type { QueueItem } from "./queue";

type DeckFlow = {
  deckId: DeckId;
  activeId: DeckId;
  /** Este deck ya cedió el aire a otro (fundido iniciado o hecho): no debe volver a disparar nada. */
  handedOff: boolean;
  /** Hay un fundido o un cambio de pista en curso. */
  fading: boolean;
  auto: boolean;
};

/** ¿Debe empezar ahora el fundido hacia la pista siguiente? Decisión pura a partir del tiempo del deck. */
export function shouldStartFade(input: DeckFlow & { current: number; duration: number; fadeSec: number }): boolean {
  if (input.deckId !== input.activeId || input.handedOff || input.fading || !input.auto) return false;
  const plan = planCrossfade({ durationSec: input.duration, fadeSec: input.fadeSec });
  return plan !== null && input.current >= plan.startAtSec;
}

/** Una pista terminó sin fundido (muy corta o sin duración legible): ¿hay que pasar a la siguiente ya? */
export function shouldAdvanceOnEnd(input: DeckFlow & { hasNext: boolean }): boolean {
  return input.deckId === input.activeId && !input.handedOff && !input.fading && input.auto && input.hasNext;
}

/** Qué sonará después: la pista ya cargada y detenida en el otro deck, o la cabeza de la cola. */
export function pickNext(input: {
  queue: QueueItem[];
  otherDeckItem: QueueItem | null;
  otherDeckPlaying: boolean;
  /** El otro deck ya sonó y cedió el aire (o terminó): su pista no es una precarga. */
  otherDeckConsumed: boolean;
}): { source: "deck" } | { source: "queue"; item: QueueItem } | null {
  if (input.otherDeckItem && !input.otherDeckPlaying && !input.otherDeckConsumed) return { source: "deck" };
  const head = input.queue[0];
  return head ? { source: "queue", item: head } : null;
}

/** Solo la última carga pedida a un deck es vigente; las anteriores deben descartar su resultado. */
export class LoadGate {
  private seq = 0;
  next(): number {
    return ++this.seq;
  }
  isCurrent(token: number): boolean {
    return token === this.seq;
  }
  invalidate(): void {
    this.seq++;
  }
}

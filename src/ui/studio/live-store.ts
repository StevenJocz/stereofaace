export type LiveInfo = { live: boolean; since: number | null; program: string | null; endsAt: number | null };

const IDLE: LiveInfo = { live: false, since: null, program: null, endsAt: null };

/** Estado mínimo de la transmisión, compartido entre la consola y la barra «EN VIVO» del panel. */
export function createLiveStore() {
  let state: LiveInfo = IDLE;
  let stop: (() => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    set(next: LiveInfo) {
      if (next.live === state.live && next.since === state.since && next.program === state.program && next.endsAt === state.endsAt) return;
      state = next;
      for (const l of listeners) l();
    },
    registerStop(fn: () => void) {
      stop = fn;
      return () => {
        if (stop === fn) stop = null;
      };
    },
    requestStop() {
      stop?.();
    },
  };
}

export const liveStore = createLiveStore();
export const serverIdle = () => IDLE;

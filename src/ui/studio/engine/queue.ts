/** Cola de reproducción del estudio: estado puro, sin DOM. */
export type QueueItem = {
  id: string;
  /** Archivo del computador del DJ (null si viene de AzuraCast). */
  file: File | null;
  /** URL de audio del mismo origen (biblioteca de AzuraCast); null si es un archivo local. */
  url: string | null;
  title: string;
  artist: string;
  durationSec: number | null;
  source: "local" | "cart" | "azuracast";
};

export type QueueAction =
  | { type: "add"; items: QueueItem[] }
  | { type: "remove"; id: string }
  | { type: "move"; from: number; to: number }
  | { type: "shift" }
  | { type: "clear" };

export function queueReducer(state: QueueItem[], action: QueueAction): QueueItem[] {
  switch (action.type) {
    case "add":
      return [...state, ...action.items];
    case "remove":
      return state.some((i) => i.id === action.id) ? state.filter((i) => i.id !== action.id) : state;
    case "move": {
      const { from, to } = action;
      if (from < 0 || from >= state.length || to < 0 || to >= state.length || from === to) return state;
      const next = state.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    }
    case "shift":
      return state.slice(1);
    case "clear":
      return [];
  }
}

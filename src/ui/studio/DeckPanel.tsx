import type { QueueItem } from "./engine/queue";

/** Estado de un deck (A o B) tal como lo ve la interfaz. */
export type DeckView = {
  item: QueueItem | null;
  durationSec: number | null;
  currentSec: number;
  playing: boolean;
  volume: number;
  coverUrl: string | null;
  /** Ya cedió el aire (o terminó): su pista no cuenta como «la siguiente» aunque siga cargada. */
  spent: boolean;
};

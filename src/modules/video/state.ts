import { DomainError } from "@/lib/errors";

/** preparada → previsualizando → iniciando → en vivo → finalizando → terminada; «error» desde cualquier fase activa. */
export const VIDEO_STATES = ["ready", "previewing", "starting", "live", "ending", "ended", "error"] as const;
export type VideoState = (typeof VIDEO_STATES)[number];

export const VIDEO_STATE_LABEL: Record<VideoState, string> = {
  ready: "Preparada",
  previewing: "Previsualizando",
  starting: "Iniciando",
  live: "En vivo",
  ending: "Finalizando",
  ended: "Terminada",
  error: "Error",
};

const NEXT: Record<VideoState, readonly VideoState[]> = {
  ready: ["previewing", "ending", "error"],
  previewing: ["starting", "ending", "error"],
  starting: ["live", "ending", "error"],
  live: ["ending", "error"],
  ending: ["ended", "error"],
  ended: [],
  error: [],
};

export const isActiveState = (s: VideoState) => s !== "ended" && s !== "error";

export function canTransition(from: VideoState, to: VideoState): boolean {
  return NEXT[from].includes(to);
}

export function assertTransition(from: VideoState, to: VideoState): void {
  if (!canTransition(from, to)) throw new DomainError("video_state", `No se puede pasar de «${VIDEO_STATE_LABEL[from]}» a «${VIDEO_STATE_LABEL[to]}».`);
}

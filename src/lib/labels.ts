import type { ReleaseKind } from "@/modules/releases/schema";
import type { EventKind } from "@/modules/events/schema";

export const RELEASE_KIND_LABEL: Record<ReleaseKind, string> = {
  album: "Álbum",
  ep: "EP",
  single: "Single",
  remix: "Remix",
  video: "Videoclip",
  set: "Set",
  podcast: "Podcast",
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  festival: "Festival",
  concierto: "Concierto",
  rave: "Rave",
  presentacion: "Presentación",
  underground: "Underground",
  gira: "Gira",
};

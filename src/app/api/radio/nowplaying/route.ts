import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { getStationFeed } from "@/modules/radio/nowplaying";

const HEADERS = { "cache-control": "public, max-age=0, s-maxage=10" };

/** Qué suena y las dos anteriores en StereoFace Radio (público, caché corta). Solo datos públicos de la canción. */
export async function GET() {
  await connection();
  try {
    const feed = await getStationFeed(await getDb());
    if (!feed) return Response.json({ nowPlaying: null, history: [] }, { headers: HEADERS });
    return Response.json({ nowPlaying: feed.nowPlaying, history: feed.history.slice(0, 2) }, { headers: HEADERS });
  } catch (error) {
    console.error("[radio/nowplaying]", error);
    return Response.json({ nowPlaying: null, history: [] }, { headers: HEADERS });
  }
}

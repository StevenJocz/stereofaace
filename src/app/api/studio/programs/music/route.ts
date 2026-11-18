import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { programMusicLinkHandler, programMusicListHandler, programMusicUnlinkHandler } from "@/modules/studio/library-http";

export async function GET() {
  await connection();
  return programMusicListHandler(await getDb(), await getCurrentUser());
}

export async function POST(request: Request) {
  await connection();
  return programMusicLinkHandler(await getDb(), await getCurrentUser(), request);
}

export async function DELETE(request: Request) {
  await connection();
  return programMusicUnlinkHandler(await getDb(), await getCurrentUser(), request);
}

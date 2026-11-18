import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { MEDIA_ROOT } from "@/modules/media/service";
import { spaceImageHandler } from "@/modules/spaces/http";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  await connection();
  const { key } = await params;
  return spaceImageHandler(await getDb(), await getCurrentUser(), MEDIA_ROOT, key);
}

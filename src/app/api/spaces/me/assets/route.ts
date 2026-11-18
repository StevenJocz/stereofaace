import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { MEDIA_ROOT } from "@/modules/media/service";
import { meAssetDeleteHandler, meAssetUploadHandler } from "@/modules/spaces/http";

export async function POST(request: Request) {
  await connection();
  return meAssetUploadHandler(await getDb(), await getCurrentUser(), request, MEDIA_ROOT);
}

export async function DELETE(request: Request) {
  await connection();
  return meAssetDeleteHandler(await getDb(), await getCurrentUser(), request, MEDIA_ROOT);
}

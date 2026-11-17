import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { publicVideoHandler } from "@/modules/video/http";

export async function GET() {
  await connection();
  return publicVideoHandler(await getDb());
}

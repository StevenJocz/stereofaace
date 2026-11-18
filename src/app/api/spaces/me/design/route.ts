import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { meDesignHandler } from "@/modules/spaces/http";

export async function PUT(request: Request) {
  await connection();
  return meDesignHandler(await getDb(), await getCurrentUser(), request);
}

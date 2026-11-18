import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createMailer } from "@/modules/spaces/mailer";
import { mePublishHandler, meUnpublishHandler } from "@/modules/spaces/http";

export async function POST(request: Request) {
  await connection();
  return mePublishHandler(await getDb(), await getCurrentUser(), request, createMailer());
}

export async function DELETE(request: Request) {
  await connection();
  return meUnpublishHandler(await getDb(), await getCurrentUser(), request);
}

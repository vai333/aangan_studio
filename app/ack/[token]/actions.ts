"use server";
import { redirect } from "next/navigation";
import { acknowledgeHandoff } from "@/lib/data/repo";
import { verifyAck } from "@/lib/tokens";

export async function ackAction(token: string) {
  const id = verifyAck(token);
  if (id) await acknowledgeHandoff(id);
  redirect(`/ack/${token}?done=1`);
}

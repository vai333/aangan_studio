"use server";
import { revalidatePath } from "next/cache";
import {
  acknowledgeHandoff, clearOverride, getSettings, overrideDecision, redecide, requireAdmin, resolveEscalation, saveSettings,
} from "@/lib/data/repo";
import type { Decision, Settings } from "@/lib/types";
import { dbConfigured } from "@/lib/db";
import { importVaaniCall, syncFromVaani, type SyncResult } from "@/lib/vaani/sync";
import { hubspotConfigured, inspectHubspot, type PipelineInfo } from "@/lib/hubspot/client";
import { callsNeedingHubspot, pushCallToHubspot } from "@/lib/hubspot/sync";

const DECISIONS: Decision[] = ["QUALIFIED", "QUALIFIED_WITH_NOTES", "NURTURE", "NOT_QUALIFIED", "ESCALATION", "INCOMPLETE"];

export async function overrideAction(_: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireAdmin();
  const callId = String(form.get("callId"));
  const decision = String(form.get("decision")) as Decision;
  const reason = String(form.get("reason") ?? "").trim();
  if (!DECISIONS.includes(decision)) return { error: "Pick a decision" };
  if (reason.length < 5) return { error: "Say why — overrides become eval data for the grader." };
  await overrideDecision(callId, decision, reason);
  if (dbConfigured()) await pushCallToHubspot(callId).catch(() => undefined); // keep the founder's view in step
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function clearOverrideAction(callId: string) {
  await requireAdmin();
  await clearOverride(callId);
  revalidatePath("/admin", "layout");
}

export async function resolveAction(escalationId: string) {
  await requireAdmin();
  await resolveEscalation(escalationId);
  revalidatePath("/admin", "layout");
}

export async function markPickedUpAction(handoffId: string) {
  await requireAdmin();
  await acknowledgeHandoff(handoffId);
  revalidatePath("/admin", "layout");
}

export async function addAreaAction(callId: string, area: string) {
  await requireAdmin();
  const s = await getSettings();
  const name = area.trim();
  if (name && !s.areas_in.some((a) => a.toLowerCase() === name.toLowerCase())) {
    await saveSettings({ ...s, areas_in: [...s.areas_in, name], areas_out: s.areas_out.filter((a) => a.toLowerCase() !== name.toLowerCase()) });
  }
  await redecide(callId);
  revalidatePath("/admin", "layout");
}

export async function saveSettingsAction(next: Settings): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const p = next.policy;
  if (p.min_weeks_to_completion < 6) return { ok: false, error: "services.md: nothing can be ready in under 6 weeks." };
  if (next.designers.filter((d) => d.active).length === 0) return { ok: false, error: "Keep at least one active designer." };
  await saveSettings(next);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function syncVaaniAction(): Promise<SyncResult & { demo?: boolean }> {
  await requireAdmin();
  if (!dbConfigured()) return { fetched: 0, imported: 0, updated: 0, skipped: 0, graded: 0, demo: true };
  const r = await syncFromVaani({ pages: 3 });
  revalidatePath("/admin", "layout");
  return r;
}

export async function pushHubspotAction(callId: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!dbConfigured()) return { ok: false, message: "Demo mode — nothing is pushed." };
  if (!hubspotConfigured()) return { ok: false, message: "HUBSPOT_ACCESS_TOKEN is not set." };
  const r = await pushCallToHubspot(callId);
  revalidatePath("/admin", "layout");
  return { ok: r.status === "synced", message: r.status === "synced" ? "Pushed to HubSpot." : r.reason ?? r.status };
}

export async function hubspotTestAction(): Promise<{ ok: boolean; portalId?: string; pipelines?: PipelineInfo[]; error?: string }> {
  await requireAdmin();
  const r = await inspectHubspot();
  return { ok: r.ok, portalId: r.portalId, pipelines: r.pipelines, error: r.error };
}

export async function hubspotBackfillAction(): Promise<{ pushed: number; failed: number; remaining: number; error?: string }> {
  await requireAdmin();
  if (!dbConfigured()) return { pushed: 0, failed: 0, remaining: 0, error: "Demo mode — nothing to push." };
  if (!hubspotConfigured()) return { pushed: 0, failed: 0, remaining: 0, error: "HUBSPOT_ACCESS_TOKEN is not set." };
  let pushed = 0, failed = 0;
  for (const id of await callsNeedingHubspot(40)) {
    const r = await pushCallToHubspot(id);
    r.status === "synced" ? pushed++ : failed++;
  }
  revalidatePath("/admin", "layout");
  return { pushed, failed, remaining: (await callsNeedingHubspot(500)).length };
}

export async function importVaaniCallAction(callId: string, phone: string): Promise<{ ok: boolean; message: string; id?: string }> {
  await requireAdmin();
  if (!dbConfigured()) return { ok: false, message: "Demo mode: set DATABASE_URL to import real calls." };
  const r = await importVaaniCall(callId, phone);
  revalidatePath("/admin", "layout");
  return r;
}

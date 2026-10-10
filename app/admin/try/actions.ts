"use server";
import { getSettings, requireAdmin } from "@/lib/data/repo";
import { decide } from "@/lib/decision";
import { gradeTranscript } from "@/lib/grading/gemini";
import { parseTranscriptString } from "@/lib/vaani/adapter";
import { scorePriority } from "@/lib/priority";
import type { CriterionKey, Decision, Grading, Judgement } from "@/lib/types";

export interface TryResult {
  error?: string;
  decision?: Decision;
  reasons?: string[];
  priority?: number;
  criteria?: Record<CriterionKey, Judgement>;
  grading?: Grading;
  model?: string;
  tokens?: number;
}

export async function tryGrade(_: TryResult, form: FormData): Promise<TryResult> {
  await requireAdmin();
  if (!process.env.GEMINI_API_KEY) return { error: "Add GEMINI_API_KEY to .env.local to grade live. (The September replay uses hand-checked golden labels.)" };
  const raw = String(form.get("transcript") ?? "").trim();
  if (raw.length < 20) return { error: "Paste a conversation first." };

  // Accept "Agent:/Caller:" lines, WhatsApp-style "Name: …" lines, or a web-form dump.
  let turns = parseTranscriptString(raw.replace(/^(front desk|studio|aangan)\s*:/gim, "AGENT:").replace(/^(caller|customer|client)\s*:/gim, "USER:"));
  if (turns.length < 2) turns = [{ speaker: "caller", text: raw }];

  try {
    const s = await getSettings();
    const g = await gradeTranscript(turns, { callDateIso: new Date().toISOString(), priorCalls: 0, settings: s });
    const d = decide(g.grading, "answered", s);
    const p = scorePriority({ ...g.grading, criteria: d.criteria }, d.decision, 0);
    return { decision: d.decision, reasons: d.reasons, priority: p.score, criteria: d.criteria, grading: g.grading, model: g.model, tokens: g.inputTokens + g.outputTokens };
  } catch (e) {
    return { error: String(e).slice(0, 400) };
  }
}

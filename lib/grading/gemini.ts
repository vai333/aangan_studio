import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Grading, Settings, TranscriptTurn } from "../types";
import { GRADER_PROMPT_MD, PRICING_MD, QUALIFIED_MD, SERVICES_MD } from "./context";
import { GRADING_JSON_SCHEMA, GradingZ } from "./schema";

export const PROMPT_VERSION = "grader-v1.1";

export interface GradeResult {
  grading: Grading;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function renderTranscript(turns: TranscriptTurn[]): string {
  return turns.map((t) => `${t.speaker === "agent" ? "STUDIO" : "CALLER"}: ${t.text}`).join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busy / rate-limited / network trouble: worth waiting and retrying, then trying another model. */
const isTransient = (e: unknown) => /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|fetch failed|ETIMEDOUT|ECONNRESET|timed? ?out/i.test(String(e));

export async function gradeTranscript(
  turns: TranscriptTurn[],
  ctx: { callDateIso: string; priorCalls: number; settings: Settings },
): Promise<GradeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const primary = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  const system = [
    GRADER_PROMPT_MD,
    "\n---\n# qualified.md\n" + QUALIFIED_MD,
    "\n---\n# services.md\n" + SERVICES_MD,
    "\n---\n# pricing.md (internal — never repeat any number)\n" + PRICING_MD,
    `\n---\n# Current service-area list (admin-maintained)\nIn: ${ctx.settings.areas_in.join(", ")}\nNot served: ${ctx.settings.areas_out.join(", ")}`,
  ].join("\n");

  const user = `Call date: ${ctx.callDateIso}\nPrior calls from this number in 30 days: ${ctx.priorCalls}\n\nTRANSCRIPT\n${renderTranscript(turns)}`;

  // Primary model: up to 3 tries with backoff on busy/rate-limit errors; one corrective retry on bad JSON.
  // Then the fallback model, same rules. Only after both fail does the job queue take over.
  const backoff = [800, 2500];
  const errors: string[] = [];
  for (const model of [...new Set([primary, fallback])]) {
    let hint = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: user + hint }] }],
          config: {
            systemInstruction: system,
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: GRADING_JSON_SCHEMA,
            httpOptions: { timeout: 25_000 },
          },
        });
        const parsed = GradingZ.parse(JSON.parse(res.text ?? ""));
        return {
          grading: parsed as Grading,
          model,
          inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
        };
      } catch (e) {
        errors.push(`${model}: ${String(e).slice(0, 160)}`);
        if (isTransient(e)) { if (attempt < 2) await sleep(backoff[attempt]); continue; }
        if (attempt === 0 && /JSON|ZodError|Unexpected|expected/i.test(String(e))) { hint = `\n\nYour previous answer was not valid JSON for the schema (${String(e).slice(0, 300)}). Answer again.`; continue; }
        break; // not worth retrying on this model
      }
    }
  }
  throw new Error(`Gemini grading failed on ${primary} and ${fallback}: ${errors.slice(-2).join(" | ")}`);
}

export { emptyGradingPure as emptyGrading } from "./empty";

import { z } from "zod";

// One schema, two uses: zod validates Gemini's output at runtime; the JSON
// Schema below is sent as responseJsonSchema so Gemini can only answer in shape.

const verdict = z.enum(["pass", "unclear", "fail"]);
const judgement = z.object({
  verdict,
  evidence: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});

export const GradingZ = z.object({
  criteria: z.object({
    scope: judgement,
    real_project: judgement,
    service_area: judgement,
    timeline: judgement,
    budget: judgement,
    decision_maker: judgement,
  }),
  extracted: z.object({
    name: z.string().nullable(),
    locality: z.string().nullable(),
    property_type: z.enum(["apartment", "villa", "independent_house", "office", "clinic", "studio", "restaurant", "retail", "gym", "other"]).nullable(),
    segment: z.enum(["residential", "commercial"]).nullable(),
    bhk: z.number().int().nullable(),
    carpet_sqft: z.number().nullable(),
    rooms_in_scope: z.array(z.string()),
    scope_breadth: z.enum(["full", "partial", "single_room", "advice_only"]).nullable(),
    current_state: z.string().nullable(),
    timeline_text: z.string().nullable(),
    weeks_until_needed: z.number().nullable(),
    site_available_now: z.boolean().nullable(),
    open_to_later_start: z.boolean().nullable(),
    budget_volunteered: z.string().nullable(),
    decision_maker_status: z.string().nullable(),
    referral_source: z.string().nullable(),
    asked_price: z.boolean(),
    preferred_consult_slot: z.string().nullable(),
    language: z.enum(["en", "hi", "mr", "mixed"]),
    sentiment: z.enum(["positive", "neutral", "frustrated", "angry"]),
  }),
  flags: z.object({
    vip_referral: z.boolean(),
    repeat_caller: z.boolean(),
    existing_client: z.boolean(),
    urgent: z.boolean(),
  }),
  summary: z.string(),
  open_points: z.array(z.string()),
});

const nStr = { type: ["string", "null"] };
const nNum = { type: ["number", "null"] };
const nBool = { type: ["boolean", "null"] };
const J = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "unclear", "fail"] },
    evidence: { ...nStr, description: "Exact words from the transcript. null if nothing was said." },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    note: { type: "string" },
  },
  required: ["verdict", "evidence", "confidence"],
};

export const GRADING_JSON_SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "object",
      properties: { scope: J, real_project: J, service_area: J, timeline: J, budget: J, decision_maker: J },
      required: ["scope", "real_project", "service_area", "timeline", "budget", "decision_maker"],
    },
    extracted: {
      type: "object",
      properties: {
        name: nStr, locality: nStr,
        property_type: { type: ["string", "null"], enum: ["apartment", "villa", "independent_house", "office", "clinic", "studio", "restaurant", "retail", "gym", "other", null] },
        segment: { type: ["string", "null"], enum: ["residential", "commercial", null] },
        bhk: { type: ["integer", "null"] }, carpet_sqft: nNum,
        rooms_in_scope: { type: "array", items: { type: "string" } },
        scope_breadth: { type: ["string", "null"], enum: ["full", "partial", "single_room", "advice_only", null] },
        current_state: nStr, timeline_text: nStr,
        weeks_until_needed: { ...nNum, description: "Weeks from the call date until the caller needs it COMPLETE. null if not said." },
        site_available_now: nBool, open_to_later_start: nBool,
        budget_volunteered: { ...nStr, description: "Only if the caller said a number unprompted." },
        decision_maker_status: nStr, referral_source: nStr,
        asked_price: { type: "boolean" }, preferred_consult_slot: nStr,
        language: { type: "string", enum: ["en", "hi", "mr", "mixed"] },
        sentiment: { type: "string", enum: ["positive", "neutral", "frustrated", "angry"] },
      },
      required: ["name", "locality", "property_type", "segment", "bhk", "carpet_sqft", "rooms_in_scope", "scope_breadth", "current_state", "timeline_text", "weeks_until_needed", "site_available_now", "open_to_later_start", "budget_volunteered", "decision_maker_status", "referral_source", "asked_price", "preferred_consult_slot", "language", "sentiment"],
    },
    flags: {
      type: "object",
      properties: { vip_referral: { type: "boolean" }, repeat_caller: { type: "boolean" }, existing_client: { type: "boolean" }, urgent: { type: "boolean" } },
      required: ["vip_referral", "repeat_caller", "existing_client", "urgent"],
    },
    summary: { type: "string", description: "3–4 sentences a designer can read in 20 seconds. No prices." },
    open_points: { type: "array", items: { type: "string" } },
  },
  required: ["criteria", "extracted", "flags", "summary", "open_points"],
} as const;

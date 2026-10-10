// Eval harness.
//   npm run eval        → offline: golden gradings → decision rules (tests lib/decision.ts)
//   npm run eval:live   → Gemini grades every transcript; per-criterion + decision accuracy
import fs from "node:fs";
import { SEPTEMBER } from "../lib/demo/september";
import { decide } from "../lib/decision";
import { emptyGradingPure } from "../lib/grading/empty";
import { DEFAULT_SETTINGS } from "../lib/settings-defaults";
import { RUBRIC_KEYS, type CriterionKey, type Decision } from "../lib/types";
import { TEXT_CASES } from "./text_cases";

const live = process.argv.includes("--live");
const s = DEFAULT_SETTINGS;
const KEYS: CriterionKey[] = ["scope", ...RUBRIC_KEYS];
const pad = (x: string, n: number) => x.padEnd(n).slice(0, n);

async function main() {
  const phone = SEPTEMBER.filter((c) => !c.merged_into);
  const rows: { id: string; expected: string; got: string; ok: boolean }[] = [];
  const perCrit: Record<string, { ok: number; n: number }> = Object.fromEntries(KEYS.map((k) => [k, { ok: 0, n: 0 }]));

  let grade: typeof import("../lib/grading/gemini").gradeTranscript | null = null;
  if (live) {
    if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY for --live");
    grade = (await import("../lib/grading/gemini")).gradeTranscript;
  }

  for (const c of phone) {
    let g = c.grading ?? emptyGradingPure();
    if (grade && c.status !== "missed") {
      const merged = SEPTEMBER.filter((m) => m.merged_into === c.label).flatMap((m) => m.transcript);
      g = (await grade([...merged, ...c.transcript], { callDateIso: c.started_at, priorCalls: merged.length ? 1 : 0, settings: s })).grading;
      if (c.grading) for (const k of KEYS) {
        perCrit[k].n++;
        if (g.criteria[k].verdict === c.grading.criteria[k].verdict) perCrit[k].ok++;
      }
    }
    const d = decide(g, c.status, s).decision;
    rows.push({ id: c.label.replace(/b$/, ""), expected: c.expected, got: d, ok: d === c.expected });
  }

  if (grade) {
    for (const c of TEXT_CASES) {
      const g = (await grade(c.turns, { callDateIso: "2026-09-15T12:00:00+05:30", priorCalls: 0, settings: s })).grading;
      const d: Decision = decide(g, "answered", s).decision;
      rows.push({ id: c.id, expected: c.expected.join("|"), got: d, ok: c.expected.includes(d) });
    }
  }

  console.log(`\nAangan eval — ${live ? "LIVE (Gemini)" : "offline (golden gradings → rules)"}\n`);
  console.log(`${pad("Case", 6)} ${pad("Expected", 42)} ${pad("Got", 22)}`);
  for (const r of rows) console.log(`${pad(r.id, 6)} ${pad(r.expected, 42)} ${pad(r.got, 22)} ${r.ok ? "✓" : "✗"}`);
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\nDecision accuracy: ${ok}/${rows.length} (${Math.round((ok / rows.length) * 100)}%)`);
  if (live) {
    console.log("\nPer-criterion agreement with golden labels (phone set):");
    for (const k of KEYS) console.log(`  ${pad(k, 16)} ${perCrit[k].ok}/${perCrit[k].n}`);
  }
  fs.mkdirSync("evals/results", { recursive: true });
  fs.writeFileSync(`evals/results/${live ? "live" : "offline"}-${Date.now()}.json`, JSON.stringify({ rows, perCrit }, null, 2));
  if (!live && ok !== rows.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

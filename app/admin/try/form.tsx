"use client";
import { useActionState, useState } from "react";
import { DecisionBadge, VerdictGlyph } from "@/components/ui";
import { CRITERION_LABEL, type CriterionKey } from "@/lib/types";
import { tryGrade, type TryResult } from "./actions";

const SAMPLES: Record<string, string> = {
  "W03 · WhatsApp, Hinglish": `Caller: Namaste. Mera flat hai Pimple Nilakh mein. 3BHK. Interior design karwana hai poora ghar. Budget bhi hai. Kaise contact karein?
Studio: Namaste Sunil ji! Zaroor. Pimple Nilakh hamare service area mein hai. Aap kab available hain consultation ke liye?
Caller: Koi bhi Saturday subah theek hai.`,
  "F03 · Web form, Talegaon": `Caller: Name: Nilesh Dhamdhere. Project type: Residential — Full home. Location: Talegaon Dabhade, near Pune. Carpet area: ~1,400 sq ft (3BHK independent house). Current state: Just got possession. Need to do everything from scratch. Timeline: 3–4 months, flexible. Budget: ₹15–20 lakh for the full home. Notes: I know Talegaon is a bit outside Pune — wanted to check if you can still take up the project.`,
  "F08 · Web form, 3-week rush": `Caller: Name: Divya Hegde. Project type: Residential — Partial (living room + kitchen). Location: Wakad, Pune. Carpet area: ~875 sq ft (2BHK). Current state: We have guests arriving from the US in 3 weeks. We want to make the living room and kitchen look presentable before they arrive. Timeline: 3 weeks maximum. Budget: ₹4–5 lakh.`,
  "W08 · WhatsApp, ignored 4 days": `Caller: Hello — I messaged 4 days ago about my flat in Aundh. No one replied. Is anyone monitoring this number?
Studio: Hi Pradeep — I sincerely apologise. Please tell me about your project and I'll make sure we respond promptly.
Caller: It was this number. 2BHK in Aundh. 850 sq ft. Full interiors. But now I'm not sure I want to work with a studio that doesn't reply for 4 days.`,
};

const KEYS: CriterionKey[] = ["scope", "real_project", "service_area", "timeline", "budget", "decision_maker"];

export function TryForm({ enabled }: { enabled: boolean }) {
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<TryResult, FormData>(tryGrade, {});

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <form action={action} className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(SAMPLES).map((k) => (
            <button key={k} type="button" onClick={() => setText(SAMPLES[k])} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-ink">{k}</button>
          ))}
        </div>
        <textarea name="transcript" value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder={"Studio: Good morning, Aangan Studio.\nCaller: Hi, I have a 2BHK in Baner…"}
          className="focus-ring w-full rounded-xl border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed" />
        <button disabled={pending || !enabled} className="focus-ring rounded-full bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Grading…" : "Grade it"}</button>
        {!enabled && <p className="text-xs text-warn">Live grading needs GEMINI_API_KEY in .env.local.</p>}
        <p className="text-xs text-muted">Nothing is saved. This is how WhatsApp and the web form plug in later: same grader, same rules, different input.</p>
      </form>

      <div className="card p-5">
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
        {state.decision ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><DecisionBadge d={state.decision} size="lg" /><span className="text-sm text-muted">Priority {state.priority} · {state.model} · {state.tokens} tokens</span></div>
            <ul className="space-y-1 text-sm text-ink-2">{state.reasons?.map((r) => <li key={r}>• {r}</li>)}</ul>
            <ol className="space-y-2">
              {KEYS.map((k) => (
                <li key={k} className="rounded-lg border border-line p-2.5 text-sm">
                  <span className="flex items-center gap-2"><VerdictGlyph v={state.criteria![k].verdict} /><b className="font-medium">{CRITERION_LABEL[k]}</b></span>
                  {state.criteria![k].evidence && <span className="mt-1 block italic text-ink-2">“{state.criteria![k].evidence}”</span>}
                  {state.criteria![k].note && <span className="mt-1 block text-xs text-muted">{state.criteria![k].note}</span>}
                </li>
              ))}
            </ol>
            <p className="text-sm">{state.grading?.summary}</p>
          </div>
        ) : !state.error && <p className="text-sm text-muted">Pick a sample or paste a conversation, then grade it. You&apos;ll see Gemini&apos;s verdict on each criterion with its evidence, and the decision the rules reach.</p>}
      </div>
    </div>
  );
}

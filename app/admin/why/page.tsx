import { Card } from "@/components/ui";
import { mode } from "@/lib/data/repo";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Why won't it quote our per-square-foot price?",
    a: <>Because your own pricing guide forbids it. pricing.md says “No number from this guide should be quoted to a client” and lists exactly what the agent must never say — any range, “starts at”, “for a 2BHK it&apos;s typically”. The figures are “indicative only, varies by site”: a quote from a voice agent that hasn&apos;t seen the site becomes the number the client holds you to. Your front desk already handles this well. In T02 and T13 callers pushed twice for a ballpark, got the deflection, and booked anyway. So we built that instead: the agent gives pricing.md&apos;s one approved line and offers to book the consultation on the spot. Asking about price never counts against a caller. To make a leak impossible, the voice agent is never given the price list. Only the post-call grader sees it, and only to judge a budget the caller volunteered.</>,
  },
  {
    q: "Why email to designers, not Telegram?",
    a: <>Email gives 14 designers a searchable record without anyone installing a bot. A lead can carry links, its thread holds the whole history, and cc&apos;ing you or a shared inbox takes one line. It also leaves an audit trail when a lead is reassigned. Telegram is better at instant push and read receipts, so we built around those gaps. The email goes out within about a minute of the hang-up. The subject line says what the lead is (“[QUALIFIED · P82] 3BHK Kothrud · 1,400 sq ft · by Mar · Referral”) so it can be triaged from the lock screen. A one-click Acknowledge acts as the read receipt. Any qualified lead nobody acknowledges within 2 hours shows up on “Needs you”.</>,
  },
  {
    q: "Why does an AI grade the call but code make the decision?",
    a: <>Gemini is good at reading a messy conversation, Hinglish included, and finding the sentence that shows a caller is the owner or needs it before Diwali. It is not a reliable judge of your rules. So it only returns a pass, unclear or fail for each criterion, with the caller&apos;s exact words as evidence. A short, readable file of code then applies qualified.md: unclear on 1–3 means ask before forwarding, unclear on 4–5 means forward with a note, a fail means close gracefully. Your area list and lead-time rules are checked by code, not by the model. Every decision can be traced back to a quote and a rule, and when you change a rule it applies the same way to every call.</>,
  },
  {
    q: "What does it cost?",
    a: <>About ₹7,000 a month at today&apos;s ~200 calls, or around ₹35 a call. Most of that is Vaani voice minutes; the AI grading costs well under ₹1 a call. At 1,000 calls it&apos;s about ₹26,000 a month. On the brief&apos;s own numbers, the 48% of enquiries that go unanswered today cost lakhs a month in lost projects. The Cost &amp; value page shows the live figures, including what the tool itself costs.</>,
  },
  {
    q: "What happens when it gets one wrong?",
    a: <>The system is built to fail safe. It forwards nothing it isn&apos;t sure about: anything unclear goes to a person, not a designer. Unknown localities are marked “unclear” and come to you, never auto-declined. Anyone can override a decision from the call page. A reason is required, and every override is logged and becomes a test case for the next version of the grader prompt. If grading fails three times, the call goes to the callback queue, so no caller is ever silently lost. Existing-client complaints skip the rubric entirely and go straight to you.</>,
  },
  {
    q: "How does this extend to WhatsApp and the web form?",
    a: <>Only the input changes. The grader, the rules, the email and this dashboard stay the same. A WhatsApp Business webhook or a form submission becomes a “transcript” and goes through the same pipeline; the Try the grader page already does this for W01–W10 and F01–F10. WhatsApp can also reply instantly with the same script, which fixes W02, W05 and W08, where messages went unread for days.</>,
  },
  {
    q: "What's in v2?",
    a: <>Real calendar booking during the call, instead of capturing a preferred slot. A WhatsApp confirmation to the caller right after they hang up. The WhatsApp and web-form channels. A weekly eval run of every overridden call. Routing by designer speciality and availability.</>,
  },
];

const OPEN: { q: string; d: string }[] = [
  { q: "Price quoting (your ask vs pricing.md)", d: "Cut. The agent deflects with pricing.md's line and books the consultation. (The brief's Cut instruction names “Arjun”; I've read that as a typo for Nikhil.)" },
  { q: "Lead time: services.md says never under 6 weeks; qualified.md says the site must be ready within 8–10 weeks; T07 says one room takes 8–10 weeks start to finish", d: "Fail if it's needed complete in under 8 weeks (Settings can't go below 6). Site-ready window: 10 weeks. Too soon but open to later → Nurture." },
  { q: "Fail rule: the header says one fail closes a lead; “At the boundary” says decline when two or more fail", d: "One hard fail → not forwarded, closed gracefully. Two or more → the clear decline line. Neither reaches a designer." },
  { q: "Commercial minimum: T18's front desk cites 500 sq ft, which isn't in services.md", d: "Applied as 500 sq ft and flagged “policy pending”. Clear the field in Settings to remove it." },
  { q: "Service area: Kharadi (T10) and Nanded City (T08) aren't on the list, but “adjoining areas” are allowed", d: "Unknown → unclear → a person decides with one click, and the list remembers." },
  { q: "Booking: the pricing script promises “I can book that for you right now”", d: "v1 captures a preferred slot, and the designer confirms within the hour. Real calendar booking is v2." },
];

const RECORDS: { t: string; chose: string; rejected: string }[] = [
  { t: "Live vs post-call", chose: "Light rules live (one clarifying question, graceful decline, pricing deflection, escalation). The authoritative verdict comes after the call: Gemini with evidence, decided by code.", rejected: "Full grading live: slower, adds latency to every turn, can't be audited. Recording only and grading everything later: callers would get no answer during the call." },
  { t: "Scoring model", chose: "A gate (pass / unclear / fail per criterion) plus a separate 0–100 priority that only orders the queue.", rejected: "A single weighted score: it hides why a lead was declined, and a big project could “outscore” a failing criterion." },
  { t: "Handoff channel", chose: "Email (Resend) with subject-line triage, an acknowledge link and a 2-hour unacknowledged flag.", rejected: "Telegram bot: instant, but needs 14 installs, isn't searchable, and makes cc and reassignment hard." },
  { t: "Routing", chose: "Least-loaded active designer for the segment, cc the leads inbox, cc Nikhil on VIP referrals.", rejected: "Everything to one inbox (that's today's “forwarded with no context” problem) or manual assignment (slow at 9pm)." },
  { t: "Missed and dropped calls", chose: "Classified from call length and caller speech, because Vaani reports no inbound “missed” event. A dropped call followed by a redial within 30 minutes is merged into one enquiry; anything else goes to the callback queue.", rejected: "Trusting the provider's status alone: it isn't documented for inbound calls." },
  { t: "Reliability", chose: "Signed webhooks, an idempotency ledger, a single-flight grading claim, two Gemini attempts with schema validation, three job retries, a daily sweep, idempotent email sends and bounce handling.", rejected: "Fire-and-forget: a Vaani retry or a Gemini timeout would double-send or drop a lead." },
];

export default function Why() {
  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="eyebrow mb-1">Why it works this way</p>
        <h1 className="font-display text-3xl leading-tight">Answers to the questions Nikhil will ask</h1>
        <p className="mt-2 text-ink-2">Every rule traces back to one of the case files: services.md, qualified.md, pricing.md, or the September transcripts.</p>
      </header>

      <div className="space-y-3">
        {FAQ.map((f, i) => (
          <details key={f.q} className="card group p-5" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg">
              {f.q}<span className="text-muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>

      <Card eyebrow="Needs your confirmation" title="Where the case files disagree, and the default we chose">
        <ol className="divide-y divide-line">
          {OPEN.map((o, i) => (
            <li key={o.q} className="grid gap-1 py-3 sm:grid-cols-[2rem_1fr_1fr] sm:gap-4">
              <span className="font-display text-lg text-muted">{i + 1}</span>
              <span className="text-sm font-medium">{o.q}</span>
              <span className="text-sm text-ink-2">{o.d}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card eyebrow="Decision records" title="What we picked, and what we turned down">
        <div className="grid gap-3 md:grid-cols-2">
          {RECORDS.map((r) => (
            <div key={r.t} className="rounded-xl border border-line p-4 text-sm">
              <p className="font-medium">{r.t}</p>
              <p className="mt-1.5 text-ink-2"><b className="text-good">Chose:</b> {r.chose}</p>
              <p className="mt-1 text-ink-2"><b className="text-muted">Rejected:</b> {r.rejected}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card eyebrow="Eval" title="Where we corrected the starting labels">
        <ul className="space-y-2 text-sm text-ink-2">
          <li><b className="text-ink">T16 → Needs callback (service recovery).</b> The transcript has no scope and no timeline, and criteria 1 and 3 must be clear before a designer sees a lead. He is a frustrated repeat caller, so it goes to a same-day senior callback rather than a cold forward.</li>
          <li><b className="text-ink">T08 → Needs callback.</b> A missed call has nothing to grade. In the new setup Vaani answers around the clock; any call that still fails is queued automatically.</li>
          <li>All other labels stand. Run <code className="rounded bg-surface-2 px-1">npm run eval</code> for per-criterion accuracy.</li>
        </ul>
      </Card>

      <Card eyebrow="Go live" title="Setup" >
        <div id="setup" className="scroll-mt-6 space-y-2 text-sm text-ink-2">
          <p>Status: <b className="text-ink">{mode() === "demo" ? "Demo mode (no database)" : "Live"}</b>. The full steps are in README.md:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Create a Neon project, set <code>DATABASE_URL</code>, run <code>npm run db:migrate</code>, and set <code>ADMIN_EMAILS</code> and <code>ADMIN_PASSWORD</code> to sign in.</li>
            <li>Set the environment variables (<code>DATABASE_URL</code>, <code>GEMINI_API_KEY</code>, <code>RESEND_API_KEY</code>, <code>VAANI_WEBHOOK_SECRET</code>, <code>ACK_SECRET</code>, <code>CRON_SECRET</code>, <code>APP_URL</code>).</li>
            <li>Paste <code>prompts/vaani_agent_prompt.md</code> into the Vaani persona, and point its webhook at <code>/api/vaani/webhook</code>.</li>
            <li>Deploy to Vercel. Call the studio number and watch the call appear on Today.</li>
          </ol>
        </div>
      </Card>
    </div>
  );
}

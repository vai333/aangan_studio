import Link from "next/link";
import { CRITERION_LABEL, DECISION_LABEL, RUBRIC_KEYS, type CriterionKey, type Decision, type Judgement, type Verdict } from "@/lib/types";

export const DECISION_VAR: Record<Decision, string> = {
  QUALIFIED: "var(--d-qualified)",
  QUALIFIED_WITH_NOTES: "var(--d-notes)",
  NURTURE: "var(--d-nurture)",
  INCOMPLETE: "var(--d-incomplete)",
  ESCALATION: "var(--d-escalation)",
  NOT_QUALIFIED: "var(--d-no)",
};

export function DecisionBadge({ d, overridden, size = "sm" }: { d: Decision | null; overridden?: boolean; size?: "sm" | "lg" }) {
  if (!d) return <span className="text-xs text-muted">Grading…</span>;
  const c = DECISION_VAR[d];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}
      style={{ background: `color-mix(in oklab, ${c} 14%, transparent)`, color: "var(--ink)", boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 35%, transparent)` }}
    >
      <span className="size-2 rounded-full" style={{ background: c }} aria-hidden />
      {DECISION_LABEL[d]}
      {overridden && <span className="text-muted" title="Manually overridden">· edited</span>}
    </span>
  );
}

const VERDICT_TEXT: Record<Verdict, string> = { pass: "Pass", unclear: "Unclear", fail: "Fail" };
export const VERDICT_VAR: Record<Verdict, string> = { pass: "var(--good)", unclear: "var(--warn)", fail: "var(--bad)" };

/** A verdict glyph: shape carries meaning as well as colour (✓ filled / ? ring / ✗). */
export function VerdictGlyph({ v, size = 14 }: { v: Verdict; size?: number }) {
  const c = VERDICT_VAR[v];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={VERDICT_TEXT[v]} role="img" className="shrink-0">
      {v === "pass" && <><rect x="1" y="1" width="14" height="14" rx="4" fill={c} /><path d="M4.5 8.3l2.2 2.2 4.8-5" stroke="var(--surface)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>}
      {v === "unclear" && <><rect x="1.75" y="1.75" width="12.5" height="12.5" rx="3.5" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="0" /><text x="8" y="11.6" textAnchor="middle" fontSize="10" fontWeight="700" fill={c}>?</text></>}
      {v === "fail" && <><rect x="1" y="1" width="14" height="14" rx="4" fill={c} /><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" /></>}
    </svg>
  );
}

/** Five rubric tiles in a row — the gate at a glance. */
export function Pips({ criteria, scope = true }: { criteria: Record<CriterionKey, Judgement> | null; scope?: boolean }) {
  if (!criteria) return <span className="text-xs text-muted">—</span>;
  const keys: CriterionKey[] = scope ? ["scope", ...RUBRIC_KEYS] : RUBRIC_KEYS;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label="Rubric">
      {keys.map((k, i) => (
        <span key={k} title={`${CRITERION_LABEL[k]}: ${VERDICT_TEXT[criteria[k].verdict]}`} className={i === 1 && scope ? "ml-1" : ""}>
          <VerdictGlyph v={criteria[k].verdict} size={13} />
        </span>
      ))}
    </span>
  );
}

export function PriorityMeter({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 tnum" title={`Priority ${value}/100 — orders the designer queue; never overrides the gate`}>
      <span className={`w-7 text-right text-sm font-semibold ${muted ? "text-muted" : ""}`}>{muted ? "—" : value}</span>
      <span className="h-1.5 w-12 rounded-full bg-surface-2 overflow-hidden">
        {!muted && <span className="block h-full rounded-full" style={{ width: `${value}%`, background: "var(--accent)" }} />}
      </span>
    </span>
  );
}

export type FlagKey = "vip" | "repeat" | "after" | "merged" | "price" | "frustrated" | "rented";
const FLAG: Record<FlagKey, { icon: string; label: string }> = {
  vip: { icon: "★", label: "VIP referral (Nikhil's network)" },
  repeat: { icon: "↻", label: "Repeat caller" },
  after: { icon: "☾", label: "After hours (outside 10am–7pm)" },
  merged: { icon: "⇄", label: "Merged with a dropped call" },
  price: { icon: "₹", label: "Asked about price — deflected" },
  frustrated: { icon: "!", label: "Frustrated caller" },
  rented: { icon: "⌂", label: "Rented home" },
};

export function Flags({ flags, withLabels }: { flags: FlagKey[]; withLabels?: boolean }) {
  if (!flags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} title={FLAG[f].label}
          className={`inline-flex items-center gap-1 rounded-md bg-surface-2 text-ink-2 ${withLabels ? "px-2 py-0.5 text-xs" : "size-5 justify-center text-[11px]"} ${f === "vip" ? "!bg-accent-soft !text-accent-ink" : ""} ${f === "frustrated" ? "!text-bad" : ""}`}>
          <span aria-hidden>{FLAG[f].icon}</span>
          {withLabels ? FLAG[f].label : <span className="sr-only">{FLAG[f].label}</span>}
        </span>
      ))}
    </span>
  );
}

export function Card({ children, className = "", title, eyebrow, action }: { children: React.ReactNode; className?: string; title?: string; eyebrow?: string; action?: React.ReactNode }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || eyebrow) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && <h2 className="font-display text-lg leading-snug">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" | "bad"; href?: string }) {
  const body = (
    <>
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{value}</p>
      {sub && <p className={`mt-1 text-xs ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-muted"}`}>{sub}</p>}
    </>
  );
  return href
    ? <Link href={href} className="card block p-4 transition hover:-translate-y-px hover:border-line-strong focus-ring">{body}</Link>
    : <div className="card p-4">{body}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="tiles rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

"use client";
import { useState, useTransition } from "react";
import { saveSettingsAction } from "../actions";
import type { Designer, Settings } from "@/lib/types";
import { HubspotPanel } from "./hubspot-panel";

const input = "focus-ring h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm";

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 p-5">
      <h2 className="font-display text-lg">{title}</h2>
      {hint && <p className="mb-4 mt-1 text-sm text-ink-2">{hint}</p>}
      {children}
    </section>
  );
}

function Num({ label, value, onChange, step = 1, suffix, help }: { label: string; value: number; onChange: (n: number) => void; step?: number; suffix?: string; help?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-ink-2">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} className={input} />
        {suffix && <span className="shrink-0 text-xs text-muted">{suffix}</span>}
      </span>
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}

function Chips({ items, onRemove, tone }: { items: string[]; onRemove: (s: string) => void; tone: "in" | "out" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((a) => (
        <li key={a} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-sm ${tone === "in" ? "bg-surface-2" : "bg-accent-soft text-accent-ink"}`}>
          {a}
          <button type="button" onClick={() => onRemove(a)} aria-label={`Remove ${a}`} className="grid size-5 place-items-center rounded-full text-muted hover:bg-line hover:text-ink">×</button>
        </li>
      ))}
    </ul>
  );
}

export function SettingsForm({ initial, hubspotConnected = false }: { initial: Settings; hubspotConnected?: boolean }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [newIn, setNewIn] = useState("");
  const [newOut, setNewOut] = useState("");
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const pol = (k: keyof Settings["policy"], v: number | null) => up("policy", { ...s.policy, [k]: v });
  const pr = (k: keyof Omit<Settings["prices"], "fixed_inr_per_month">, v: number) => up("prices", { ...s.prices, [k]: v });
  const fx = (k: keyof Settings["prices"]["fixed_inr_per_month"], v: number) => up("prices", { ...s.prices, fixed_inr_per_month: { ...s.prices.fixed_inr_per_month, [k]: v } });
  const as = (k: keyof Settings["assumptions"], v: number) => up("assumptions", { ...s.assumptions, [k]: v });
  const des = (i: number, d: Partial<Designer>) => up("designers", s.designers.map((x, j) => (j === i ? { ...x, ...d } : x)));

  const save = () => start(async () => {
    const r = await saveSettingsAction(s);
    setMsg(r.ok ? { ok: true, text: "Saved. New calls use these settings; past decisions keep the rules they were made with." } : { ok: false, text: r.error ?? "Could not save" });
  });

  return (
    <div className="space-y-4 pb-24">
      <Section id="areas" title="Service area" hint="From services.md. Localities not on either list are marked “unclear” and come to you — never auto-declined.">
        <p className="eyebrow mb-2">We serve</p>
        <Chips items={s.areas_in} tone="in" onRemove={(a) => up("areas_in", s.areas_in.filter((x) => x !== a))} />
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newIn.trim()) { up("areas_in", [...s.areas_in, newIn.trim()]); setNewIn(""); } }}>
          <input value={newIn} onChange={(e) => setNewIn(e.target.value)} placeholder="Add a locality, e.g. Kharadi" className={`${input} max-w-xs`} />
          <button className="rounded-full border border-line px-3 text-sm">Add</button>
        </form>
        <p className="eyebrow mb-2 mt-5">We don&apos;t serve</p>
        <Chips items={s.areas_out} tone="out" onRemove={(a) => up("areas_out", s.areas_out.filter((x) => x !== a))} />
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newOut.trim()) { up("areas_out", [...s.areas_out, newOut.trim()]); setNewOut(""); } }}>
          <input value={newOut} onChange={(e) => setNewOut(e.target.value)} placeholder="Add a city or area" className={`${input} max-w-xs`} />
          <button className="rounded-full border border-line px-3 text-sm">Add</button>
        </form>
      </Section>

      <Section id="policy" title="Rules the gate applies" hint="Three of these resolve contradictions between the case files — the defaults are explained in “Why it works this way”.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Minimum weeks to completion" value={s.policy.min_weeks_to_completion} onChange={(n) => pol("min_weeks_to_completion", n)} suffix="weeks" help="services.md floor is 6; T07 says 8–10 for one room." />
          <Num label="Site must be ready within" value={s.policy.max_weeks_until_site_ready} onChange={(n) => pol("max_weeks_until_site_ready", n)} suffix="weeks" help="qualified.md §3: 8–10 weeks." />
          <label className="block text-sm">
            <span className="mb-1 block text-ink-2">Commercial minimum size</span>
            <span className="flex items-center gap-2">
              <input type="number" value={s.policy.commercial_min_sqft ?? ""} placeholder="none" onChange={(e) => pol("commercial_min_sqft", e.target.value ? Number(e.target.value) : null)} className={input} />
              <span className="shrink-0 text-xs text-muted">sq ft</span>
            </span>
            <span className="mt-1 block text-xs text-warn">Front-desk practice (T18), not in services.md — confirm.</span>
          </label>
          <Num label="Flag unacknowledged leads after" value={s.policy.unack_hours} onChange={(n) => pol("unack_hours", n)} suffix="hours" help="4× conversion inside the first hour." />
        </div>
      </Section>

      <Section id="routing" title="Designers & routing" hint="Qualified leads go to the least-loaded active designer for the project type (residential / commercial). VIP referrals cc Nikhil.">
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={s.routing === "round_robin"} onChange={() => up("routing", "round_robin")} /> Round-robin by project type</label>
          <label className="flex items-center gap-2"><input type="radio" checked={s.routing === "single_inbox"} onChange={() => up("routing", "single_inbox")} /> One shared inbox</label>
        </div>
        <div className="space-y-2">
          {s.designers.map((d, i) => (
            <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1.4fr_auto_auto_auto_auto]">
              <input value={d.name} onChange={(e) => des(i, { name: e.target.value })} className={input} aria-label="Name" />
              <input value={d.email} onChange={(e) => des(i, { email: e.target.value })} className={input} aria-label="Email" />
              {(["residential", "commercial"] as const).map((seg) => (
                <label key={seg} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={d.segments.includes(seg)} onChange={(e) => des(i, { segments: e.target.checked ? [...d.segments, seg] : d.segments.filter((x) => x !== seg) })} />{seg}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={d.active} onChange={(e) => des(i, { active: e.target.checked })} />active</label>
              <button type="button" onClick={() => up("designers", s.designers.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => up("designers", [...s.designers, { name: "New designer", email: "", segments: ["residential"], active: true }])} className="text-sm text-accent-ink underline">+ Add designer</button>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Call report — email after every call</span>
            <input type="email" value={s.call_report_email} onChange={(e) => up("call_report_email", e.target.value.trim())} placeholder="owner@yourdomain.in" className={`${input} max-w-md`} />
            <span className="mt-1 block text-xs text-muted">One summary email per call — answered, missed or dropped, qualified or not. Separate from the designer handoff, and skipped when this address already receives that call\u2019s handoff or escalation email (so you never get two near-identical emails). Leave blank to turn it off. While Resend is in test mode it can only deliver to the account owner&apos;s own address.</span>
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm"><span className="mb-1 block text-ink-2">Leads inbox (cc on every handoff)</span><input value={s.leads_inbox} onChange={(e) => up("leads_inbox", e.target.value)} className={input} /></label>
          <label className="text-sm"><span className="mb-1 block text-ink-2">Escalations go to</span><input value={s.escalation_email} onChange={(e) => up("escalation_email", e.target.value)} className={input} /></label>
          <label className="text-sm"><span className="mb-1 block text-ink-2">Founder (cc on VIP)</span><input value={s.founder_email} onChange={(e) => up("founder_email", e.target.value)} className={input} /></label>
        </div>
      </Section>

      <Section id="hubspot" title="HubSpot — the founder's view" hint="Every caller becomes a HubSpot contact (deduped by phone) with a note holding the summary, the gate and the transcript. Qualified and nurture leads also get a deal. No deal amount is set: the studio never quotes a price.">
        <HubspotPanel connected={hubspotConnected} hubspot={s.hubspot} onChange={(h) => up("hubspot", h)} />
      </Section>

      <Section id="prices" title="Unit prices" hint="Used for the cost panel. Checked 10 Oct 2026 — update when a bill differs.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Vaani" value={s.prices.vaani_inr_per_min} onChange={(n) => pr("vaani_inr_per_min", n)} step={0.1} suffix="₹ / min" />
          <Num label="Gemini input" value={s.prices.gemini_usd_per_m_input} onChange={(n) => pr("gemini_usd_per_m_input", n)} step={0.01} suffix="$ / 1M tok" />
          <Num label="Gemini output" value={s.prices.gemini_usd_per_m_output} onChange={(n) => pr("gemini_usd_per_m_output", n)} step={0.01} suffix="$ / 1M tok" />
          <Num label="USD → INR" value={s.prices.usd_inr} onChange={(n) => pr("usd_inr", n)} step={0.5} suffix="₹" />
          <Num label="Vercel" value={s.prices.fixed_inr_per_month.vercel} onChange={(n) => fx("vercel", n)} suffix="₹ / month" />
          <Num label="Database (Neon)" value={s.prices.fixed_inr_per_month.database} onChange={(n) => fx("database", n)} suffix="₹ / month" />
          <Num label="Email plan" value={s.prices.fixed_inr_per_month.email_plan} onChange={(n) => fx("email_plan", n)} suffix="₹ / month" />
          <Num label="Phone number" value={s.prices.fixed_inr_per_month.phone_number} onChange={(n) => fx("phone_number", n)} suffix="₹ / month" />
        </div>
      </Section>

      <Section id="assumptions" title="Business assumptions" hint="Drive the pipeline estimate and the leak calculation. Brief numbers are facts; the rest are labelled guesses — change them freely.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Avg project — low" value={s.assumptions.avg_project_lakh_low} onChange={(n) => as("avg_project_lakh_low", n)} suffix="₹ lakh" help="Brief: ₹8–14 L" />
          <Num label="Avg project — high" value={s.assumptions.avg_project_lakh_high} onChange={(n) => as("avg_project_lakh_high", n)} suffix="₹ lakh" />
          <Num label="Qualified lead → project" value={s.assumptions.qualified_to_project} onChange={(n) => as("qualified_to_project", n)} step={0.01} suffix="0–1" help="Assumption" />
          <Num label="Gross margin" value={s.assumptions.gross_margin} onChange={(n) => as("gross_margin", n)} step={0.01} suffix="0–1" help="Assumption" />
          <Num label="Enquiry converts if answered < 1 h" value={s.assumptions.enquiry_fast_conversion} onChange={(n) => as("enquiry_fast_conversion", n)} step={0.005} suffix="0–1" help="Assumption" />
          <Num label="Enquiry converts next-day" value={s.assumptions.enquiry_slow_conversion} onChange={(n) => as("enquiry_slow_conversion", n)} step={0.005} suffix="0–1" help="Brief: ¼ of the fast rate" />
          <Num label="Enquiries / month (before)" value={s.assumptions.baseline_enquiries} onChange={(n) => as("baseline_enquiries", n)} help="Brief: ~200" />
          <Num label="Average call length" value={s.assumptions.avg_call_minutes} onChange={(n) => as("avg_call_minutes", n)} step={0.1} suffix="min" help="T01–T20 ≈ 4.7" />
        </div>
      </Section>

      <Section id="rubric" title="Rubric version" hint="Stamped on every decision so you can tell which rules a past call was judged by.">
        <input value={s.rubric_version} onChange={(e) => up("rubric_version", e.target.value)} className={`${input} max-w-sm`} />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:left-[232px]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 sm:px-4">
          <p className={`text-sm ${msg ? (msg.ok ? "text-good" : "text-bad") : "text-muted"}`}>{msg?.text ?? (dirty ? "Unsaved changes" : "All saved")}</p>
          <div className="flex gap-2">
            {dirty && <button type="button" onClick={() => { setS(initial); setMsg(null); }} className="rounded-full px-4 py-2 text-sm text-muted">Discard</button>}
            <button type="button" onClick={save} disabled={!dirty || pending} className="focus-ring rounded-full bg-ink px-5 py-2 text-sm font-medium text-surface disabled:opacity-40">{pending ? "Saving…" : "Save settings"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

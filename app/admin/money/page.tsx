import Link from "next/link";
import { BarList } from "@/components/charts";
import { parsePeriod, PeriodSwitch } from "@/components/period";
import { Card, Stat } from "@/components/ui";
import { leakPerMonth, scenario } from "@/lib/cost";
import { getSettings, listRecords, now } from "@/lib/data/repo";
import { inr, inrRange, pct } from "@/lib/format";
import { computeMetrics, periodRange, PERIODS } from "@/lib/metrics";

export default async function Money({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = parsePeriod((await searchParams).p);
  const [records, s] = await Promise.all([listRecords(), getSettings()]);
  const t = now();
  const m = computeMetrics(records, s, periodRange(p, t), t);
  const leak = leakPerMonth(s);
  const scenarios = [200, 500, 1000].map((n) => scenario(n, s));
  const fx = s.prices.fixed_inr_per_month;
  const a = s.assumptions;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="eyebrow mb-2">Cost & value · {PERIODS.find((x) => x.key === p)!.label.toLowerCase()}</p>
          <h1 className="font-display text-[28px] leading-[1.2] sm:text-[34px]">
            The desk cost <span className="text-accent-ink">{inr(m.cost.total)}</span> and put an estimated{" "}
            <span className="text-accent-ink">{inrRange(m.pipelineLow, m.pipelineHigh)}</span> of projects in front of designers.
          </h1>
          <p className="mt-2 text-ink-2">Including the cost of the tool itself. Every number below is computed from the call ledger — no monthly spreadsheet.</p>
          {m.enquiries > 0 && m.enquiries < 100 && (
            <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
              Only {m.enquiries} calls in this period, so the fixed hosting share ({inr(m.cost.fixed)}) dominates the per-call figure. At Aangan&apos;s usual ~200 calls a month it&apos;s about {inr(scenarios[0].perCall)} a call — see the table below.
            </p>
          )}
        </div>
        <PeriodSwitch current={p} base="/admin/money" />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cost per call" value={inr(m.costPerCall)} sub={`${m.enquiries} calls · ${m.vaaniMinutes.toFixed(0)} agent minutes`} />
        <Stat label="Cost per qualified lead" value={m.costPerQualified ? inr(m.costPerQualified) : "—"} sub={`${m.qualified} qualified leads`} />
        <Stat label="Pipeline per ₹1 spent" value={m.cost.total ? `₹${Math.round(m.pipelineLow / m.cost.total).toLocaleString("en-IN")}` : "—"} sub="Low end of the estimate" tone="good" />
        <Stat label="Grader tokens" value={`${(m.tokens / 1000).toFixed(0)}k`} sub={`${inr(m.cost.gemini)} on Gemini`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card eyebrow="Where the money goes" title="Spend by component">
          <BarList color="var(--accent)" unit="inr" rows={[
            { label: "Vaani voice minutes", value: m.cost.vaani, hint: `${m.vaaniMinutes.toFixed(1)} min × ₹${s.prices.vaani_inr_per_min}/min` },
            { label: "Hosting & database (share)", value: m.cost.fixed, hint: "Vercel + Neon + phone number, prorated for the period" },
            { label: "Gemini grading", value: m.cost.gemini, hint: `${m.tokens.toLocaleString("en-IN")} tokens` },
            { label: "Email (Resend)", value: m.cost.email, hint: "Free tier covers 3,000 emails/month" },
          ]} />
          <p className="mt-4 text-xs text-muted">Voice minutes are ~{Math.round((m.cost.vaani / Math.max(1, m.cost.total)) * 100)}% of spend. The AI grading is a rounding error — about {inr(m.cost.gemini / Math.max(1, m.enquiries))} a call.</p>
        </Card>

        <Card eyebrow="At Aangan's volume and beyond" title="What it costs per month">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-2 font-medium">Calls / month</th>{scenarios.map((x) => <th key={x.calls} className="py-2 text-right font-medium">{x.calls.toLocaleString("en-IN")}{x.calls === 200 ? " (today)" : ""}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr><td className="py-2 text-ink-2">Vaani ({a.avg_call_minutes} min avg)</td>{scenarios.map((x) => <td key={x.calls} className="py-2 text-right">{inr(x.vaani)}</td>)}</tr>
                <tr><td className="py-2 text-ink-2">Gemini grading</td>{scenarios.map((x) => <td key={x.calls} className="py-2 text-right">{inr(x.gemini)}</td>)}</tr>
                <tr><td className="py-2 text-ink-2">Email</td>{scenarios.map((x) => <td key={x.calls} className="py-2 text-right">{inr(x.email)}</td>)}</tr>
                <tr><td className="py-2 text-ink-2">Hosting, DB, number</td>{scenarios.map((x) => <td key={x.calls} className="py-2 text-right">{inr(x.fixed)}</td>)}</tr>
                <tr className="font-semibold"><td className="py-2">Total</td>{scenarios.map((x) => <td key={x.calls} className="py-2 text-right">{inr(x.total)}</td>)}</tr>
                <tr><td className="py-2 text-ink-2">Per call</td>{scenarios.map((x) => <td key={x.calls} className="py-2 text-right">{inr(x.perCall)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">A front-desk hire for night cover would cost more than the 1,000-call month. Unit prices are in <Link href="/admin/settings#prices" className="underline">Settings</Link>.</p>
        </Card>
      </div>

      <Card eyebrow="The case for doing this" title="What the 48% leak costs today">
        <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-[40px] font-semibold leading-none tracking-tight">{inr(leak.margin, { compact: true })}<span className="text-lg font-normal text-muted"> margin / month</span></p>
            <p className="mt-2 text-ink-2">≈ {leak.extraProjects.toFixed(1)} extra projects a month ({inr(leak.revenue, { compact: true })} revenue) — versus about {inr(scenarios[0].total)} to run the desk.</p>
          </div>
          <ol className="space-y-2 text-sm">
            <li className="flex justify-between gap-3 border-b border-line pb-2"><span className="text-ink-2">Enquiries a month (brief)</span><b className="tnum">{a.baseline_enquiries}</b></li>
            <li className="flex justify-between gap-3 border-b border-line pb-2"><span className="text-ink-2">No reply within 48 h (brief)</span><b className="tnum">{pct(a.baseline_unanswered)} = {leak.leaked.toFixed(0)}</b></li>
            <li className="flex justify-between gap-3 border-b border-line pb-2"><span className="text-ink-2">Converts if answered &lt; 1 h <span className="text-muted">[assumption]</span></span><b className="tnum">{pct(a.enquiry_fast_conversion, 1)}</b></li>
            <li className="flex justify-between gap-3 border-b border-line pb-2"><span className="text-ink-2">Converts next-day (¼ of that, per the brief)</span><b className="tnum">{pct(a.enquiry_slow_conversion, 1)}</b></li>
            <li className="flex justify-between gap-3 border-b border-line pb-2"><span className="text-ink-2">Average project (brief: ₹8–14 L)</span><b className="tnum">₹{(a.avg_project_lakh_low + a.avg_project_lakh_high) / 2} L</b></li>
            <li className="flex justify-between gap-3"><span className="text-ink-2">Gross margin <span className="text-muted">[assumption]</span></span><b className="tnum">{pct(a.gross_margin)}</b></li>
            <li className="pt-1 text-xs text-muted">Change any assumption in <Link href="/admin/settings#assumptions" className="underline">Settings</Link> and this page recalculates. Even at a tenth of these conversion rates the desk pays for itself many times over.</li>
          </ol>
        </div>
      </Card>

      <Card eyebrow="Sources" title="Unit prices used (checked 10 Oct 2026)">
        <ul className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          <li className="flex justify-between gap-3"><span className="text-ink-2">Vaani voice (Vaani Research dev plan)</span><span className="tnum">₹{s.prices.vaani_inr_per_min}/min</span></li>
          <li className="flex justify-between gap-3"><span className="text-ink-2">Gemini 3.5 Flash-Lite in / out</span><span className="tnum">${s.prices.gemini_usd_per_m_input} / ${s.prices.gemini_usd_per_m_output} per 1M</span></li>
          <li className="flex justify-between gap-3"><span className="text-ink-2">Vercel Pro (1 seat)</span><span className="tnum">{inr(fx.vercel)}/mo</span></li>
          <li className="flex justify-between gap-3"><span className="text-ink-2">Neon Postgres (free plan covers this volume)</span><span className="tnum">{inr(fx.database)}/mo</span></li>
          <li className="flex justify-between gap-3"><span className="text-ink-2">Resend (free ≤ 3,000/mo)</span><span className="tnum">{inr(fx.email_plan)}/mo</span></li>
          <li className="flex justify-between gap-3"><span className="text-ink-2">Phone number <span className="text-muted">[assumption]</span></span><span className="tnum">{inr(fx.phone_number)}/mo</span></li>
          <li className="flex justify-between gap-3"><span className="text-ink-2">USD → INR <span className="text-muted">[assumption]</span></span><span className="tnum">₹{s.prices.usd_inr}</span></li>
        </ul>
        <p className="mt-3 text-xs text-muted">Vaani per-second billing and the phone-number rental are unconfirmed — check the studio&apos;s Vaani plan. Full sourcing in docs/costing.md.</p>
      </Card>
    </div>
  );
}

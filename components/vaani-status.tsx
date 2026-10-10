import { fmtAgo } from "@/lib/format";
import type { VaaniStatus } from "@/lib/vaani/status";

function Row({ ok, title, detail }: { ok: boolean | null; title: string; detail: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${ok === true ? "bg-good text-surface" : ok === false ? "bg-bad text-surface" : "bg-surface-2 text-muted"}`} aria-hidden>{ok === true ? "✓" : ok === false ? "✗" : "–"}</span>
      <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="block text-sm text-ink-2">{detail}</span></span>
    </li>
  );
}

export function VaaniStatusCard({ s, nowMs }: { s: VaaniStatus; nowMs: number }) {
  const gotEvents = s.events.count > 0;
  return (
    <section className="card p-5" id="vaani">
      <p className="eyebrow mb-1">Voice agent</p>
      <h2 className="font-display text-lg">{gotEvents ? "Vaani is connected" : "Waiting for Vaani's first call event"}</h2>
      <ul className="mt-2 divide-y divide-line">
        <Row ok={s.keyConfigured && s.agent.found} title="Agent exists on your Vaani account" detail={s.agent.found ? `“${s.agent.name}”` : s.agent.error ?? "VAANI_API_KEY / VAANI_AGENT_ID missing. Run npm run vaani:setup."} />
        <Row ok={s.agent.found ? !!s.agent.published : null} title="Agent is published" detail={s.agent.published ? "Yes." : "No. In Vaani, open the agent and publish it, or calls may not go through."} />
        <Row ok={s.agent.found ? !!s.agent.inboundNumber : null} title="A phone number is assigned for inbound calls" detail={s.agent.inboundNumber ? s.agent.inboundNumber : "None. In Vaani → Settings → Telephony, provision a number and assign it to this agent. Without one, nobody can call it."} />
        <Row ok={gotEvents} title="Vaani has sent a call event to this site" detail={gotEvents ? `${s.events.count} event${s.events.count === 1 ? "" : "s"}, the latest ${s.events.last ? fmtAgo(s.events.last, nowMs) + " ago" : ""}.` : <>Never. In Vaani → <b>Developers → Webhooks</b> → Add, choose <b>Agent Webhook</b>, set Endpoint URL to <code className="break-all">https://{s.webhookHost}/api/vaani/webhook?token=…</code> (token = VAANI_WEBHOOK_TOKEN in <code>.env.local</code>), tick events <b>Call Post-Processing</b> and <b>Call Ended</b>, and <b>select the Aangan Studio agent</b> (required, or it never fires). Turn Enabled on and save.</>} />
      </ul>
      {!gotEvents && <p className="mt-3 text-xs text-muted">Already made a call? Import it by its Vaani call ID on the Calls page. The address must use the host shown above, <b>{s.webhookHost}</b>; any other host won&apos;t reach this site.</p>}
    </section>
  );
}

import "server-only";
import { dbConfigured, q1 } from "../db";

export interface VaaniStatus {
  keyConfigured: boolean;
  agent: { found: boolean; name?: string; published?: boolean; inboundNumber?: string | null; webhookOnAgent?: boolean; error?: string };
  events: { count: number; last: string | null };
  calls: { count: number; last: string | null };
  webhookHost: string;
  tokenSet: boolean;
}

export async function vaaniStatus(): Promise<VaaniStatus | null> {
  if (!dbConfigured()) return null;
  const key = process.env.VAANI_API_KEY, agentId = process.env.VAANI_AGENT_ID;
  let agent: VaaniStatus["agent"] = { found: false };
  if (key && agentId) {
    try {
      const res = await fetch(`https://api.vaanivoice.ai/api/agents/${agentId}`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        agent = { found: true, name: d.agent_display_name, published: !!d.published_at, inboundNumber: d.deployment_config?.phone?.call_type?.Inbound || null, webhookOnAgent: !!d.webhook };
      } else agent = { found: false, error: `Vaani answered ${res.status}` };
    } catch (e) { agent = { found: false, error: String(e).slice(0, 80) }; }
  }
  const ev = await q1("select count(*)::int as n, max(received_at) as last from webhook_events where source = 'vaani'");
  const calls = await q1("select count(*)::int as n, max(started_at) as last from calls");
  return {
    keyConfigured: !!key, agent, events: { count: ev?.n ?? 0, last: ev?.last ?? null }, calls: { count: calls?.n ?? 0, last: calls?.last ?? null },
    webhookHost: (process.env.APP_URL || "").replace(/^https?:\/\//, ""), tokenSet: !!process.env.VAANI_WEBHOOK_TOKEN,
  };
}

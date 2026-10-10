import "server-only";

// Thin HubSpot CRM v3 client. Auth: a Private App access token (HUBSPOT_ACCESS_TOKEN).
// HUBSPOT_API_BASE exists only so tests can point at a local mock.
const BASE = () => process.env.HUBSPOT_API_BASE || "https://api.hubapi.com";

export const hubspotConfigured = () => !!process.env.HUBSPOT_ACCESS_TOKEN;

export class HubspotError extends Error {
  constructor(public status: number, message: string, public category?: string) {
    super(`HubSpot ${status}${category ? " " + category : ""}: ${message}`);
  }
}

export async function hs<T = any>(method: string, path: string, body?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE() + path, {
        method,
        headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN ?? ""}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = Math.min(8000, Number(res.headers.get("retry-after") ?? 0) * 1000 || 700 * 2 ** attempt);
        last = new HubspotError(res.status, "retryable");
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) throw new HubspotError(res.status, json?.message ?? text.slice(0, 200), json?.category);
      return json as T;
    } catch (e) {
      if (e instanceof HubspotError && e.status < 500 && e.status !== 429) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export interface PipelineInfo { id: string; label: string; stages: { id: string; label: string }[] }

// What the app needs from the Private App, per capability (HubSpot's own error lists dozens of alternatives).
const NEEDS = {
  contacts: "crm.objects.contacts.read + crm.objects.contacts.write",
  deals: "crm.objects.deals.read + crm.objects.deals.write",
  pipelines: "crm.schemas.deals.read",
  notes: "notes access (granted with the contacts/deals scopes in most accounts; otherwise crm.objects.notes.read/write if your app offers them)",
} as const;

/** For Settings → "Test connection" and `npm run hubspot:check`. */
export async function inspectHubspot(): Promise<{ ok: boolean; portalId?: string; uiDomain?: string; pipelines?: PipelineInfo[]; error?: string; missing?: string[] }> {
  if (!hubspotConfigured()) return { ok: false, error: "HUBSPOT_ACCESS_TOKEN is not set" };
  let portalId: string | undefined, uiDomain: string | undefined;
  try {
    const d = await hs<{ portalId: number; uiDomain?: string }>("GET", "/account-info/v3/details");
    portalId = String(d.portalId); uiDomain = d.uiDomain;
  } catch (e) {
    if (e instanceof HubspotError && e.status === 401) return { ok: false, error: "HubSpot rejected the token (401). Create a new Private App token." };
  }
  const missing: string[] = [];
  let pipelines: PipelineInfo[] | undefined;
  const probe = async (what: keyof typeof NEEDS, path: string) => {
    try { return await hs<any>("GET", path); } // eslint-disable-line @typescript-eslint/no-explicit-any
    catch (e) { missing.push(e instanceof HubspotError && e.status === 403 ? `${what}: add scope ${NEEDS[what]}` : `${what}: ${String(e).slice(0, 100)}`); return null; }
  };
  const pl = await probe("pipelines", "/crm/v3/pipelines/deals");
  if (pl) pipelines = pl.results.map((p: { id: string; label: string; stages: { id: string; label: string }[] }) => ({ id: p.id, label: p.label, stages: p.stages.map((s) => ({ id: s.id, label: s.label })) }));
  await probe("contacts", "/crm/v3/objects/contacts?limit=1");
  await probe("deals", "/crm/v3/objects/deals?limit=1");
  await probe("notes", "/crm/v3/objects/notes?limit=1");
  return { ok: missing.length === 0, portalId, uiDomain, pipelines, missing, error: missing.length ? `The token is valid${portalId ? ` for portal ${portalId}` : ""} but is missing permissions:\n  • ${missing.join("\n  • ")}\nIn HubSpot: Settings → Integrations → Private Apps → your app → Scopes, then save.` : undefined };
}

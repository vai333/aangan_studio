// HubSpot mirror test against a local mock of HubSpot's CRM v3 API + a local Postgres.
//   DATABASE_URL=postgres://…@localhost/… npm run test:hubspot      (DESTRUCTIVE: truncates tables)
import http from "node:http";
import { SEPTEMBER } from "../lib/demo/september";
import { q } from "../lib/db";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error("Refusing to run: DATABASE_URL must be a LOCAL database."); process.exit(2); }

// ── mock HubSpot ────────────────────────────────────────────────────
type Rec = { id: string; properties: Record<string, string>; associations?: any[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
const store = { contacts: new Map<string, Rec>(), deals: new Map<string, Rec>(), notes: new Map<string, Rec>() };
const calls: string[] = [];
const faults = { rejectLeadStatus: false, failNotes: false };
let seq = 1000;
const server = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const send = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== "Bearer test-token") return send(401, { message: "bad token" });
    const u = req.url!.split("?")[0];
    calls.push(`${req.method} ${u}`);
    let m: RegExpMatchArray | null;
    if (u === "/account-info/v3/details") return send(200, { portalId: 4242 });
    if (req.method === "GET" && /^\/crm\/v3\/objects\/(contacts|deals|notes)$/.test(u)) return send(200, { results: [] });
    if (u === "/crm/v3/pipelines/deals") return send(200, { results: [{ id: "default", label: "Sales", stages: [{ id: "appointmentscheduled", label: "Appt" }, { id: "closedlost", label: "Lost" }] }] });
    if (u === "/crm/v3/objects/contacts/search") {
      const f = body.filterGroups[0].filters[0];
      const hit = [...store.contacts.values()].find((c) => c.properties[f.propertyName] === f.value);
      return send(200, { results: hit ? [{ id: hit.id, properties: hit.properties }] : [] });
    }
    if (req.method === "POST" && (m = u.match(/^\/crm\/v3\/objects\/(contacts|deals|notes)$/))) {
      const kind = m[1] as keyof typeof store;
      if (kind === "contacts" && faults.rejectLeadStatus && body.properties.hs_lead_status) return send(400, { status: "error", category: "VALIDATION_ERROR", message: "hs_lead_status invalid option" });
      if (kind === "notes" && faults.failNotes) return send(403, { status: "error", category: "MISSING_SCOPES", message: "missing scope" });
      if (kind === "deals" && !(body.properties.dealname && body.properties.dealstage)) return send(400, { message: "dealname and dealstage required" });
      if (kind === "deals" && "amount" in body.properties) return send(400, { message: "the studio never sets a deal amount" });
      const id = String(++seq);
      store[kind].set(id, { id, properties: body.properties, associations: body.associations });
      return send(201, { id, properties: body.properties });
    }
    if (req.method === "PATCH" && (m = u.match(/^\/crm\/v3\/objects\/(contacts|deals)\/(\d+)$/))) {
      const rec = store[m[1] as "contacts" | "deals"].get(m[2]);
      if (!rec) return send(404, { message: "not found" });
      if (m[1] === "contacts" && faults.rejectLeadStatus && body.properties.hs_lead_status) return send(400, { status: "error", category: "VALIDATION_ERROR", message: "hs_lead_status invalid option" });
      Object.assign(rec.properties, body.properties);
      return send(200, { id: rec.id, properties: rec.properties });
    }
    send(404, { message: `unmocked ${req.method} ${u}` });
  });
});

const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("api.resend.com")) { sent.push("mail"); return new Response(JSON.stringify({ id: "fake" }), { status: 200 }); }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.HUBSPOT_API_BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  process.env.RESEND_API_KEY = "test";

  const { ingestCall, mergeDropped } = await import("../lib/jobs/ingest");
  const { gradeCall } = await import("../lib/jobs/grade");
  const { pushCallToHubspot, callsNeedingHubspot } = await import("../lib/hubspot/sync");
  const { inspectHubspot } = await import("../lib/hubspot/client");
  const { emptyGrading } = await import("../lib/grading/gemini");

  for (const t of ["cost_events","call_reports","handoffs","escalations","overrides","assessments","calls","callers","webhook_events"]) await q(`truncate ${t} cascade`);

  const fails: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); if (!ok) fails.push(name); };

  const insp = await inspectHubspot();
  check("connection check lists pipelines and the portal", insp.ok && insp.portalId === "4242" && insp.pipelines?.[0].id === "default");

  const grader = async (_t: unknown, ctx: { callDateIso: string }) => {
    const seed = SEPTEMBER.find((c) => new Date(c.started_at).toISOString() === ctx.callDateIso)!;
    return { grading: structuredClone(seed.grading ?? emptyGrading()), model: "golden", inputTokens: 5000, outputTokens: 900 };
  };
  faults.rejectLeadStatus = true; // first run: account rejects hs_lead_status — contacts must still be created
  for (const c of SEPTEMBER) {
    const startedAt = new Date(c.started_at).toISOString();
    const call = (await ingestCall({ providerCallId: `vaani-${c.label}`, phone: c.phone, startedAt, durationSec: c.duration_sec, endReason: null, status: c.status, transcript: c.transcript, recordingUrl: null, raw: {}, source: "webhook" }))!;
    if (c.status === "answered") await mergeDropped(call.id, c.phone, startedAt);
    await gradeCall(call.id, { grader: grader as never });
  }
  faults.rejectLeadStatus = false;

  const phones = new Set(SEPTEMBER.map((c) => c.phone));
  const synced = await q("select * from hubspot_syncs");
  check("every graded call is mirrored (21 rows: 20 enquiries + the dropped call)", synced.length === 21 && synced.every((s) => s.status === "synced"), `${synced.length} rows, ${synced.filter((s) => s.status !== "synced").length} not synced`);
  check("contacts deduped by phone (T17's two calls share one)", store.contacts.size === phones.size && store.contacts.size === 20, `${store.contacts.size} contacts for ${phones.size} phones`);
  check("hs_lead_status rejected → contact still created without it", [...store.contacts.values()].every((c) => !c.properties.hs_lead_status));
  check("deals: 11 qualified + 1 nurture, none for declines/callbacks", store.deals.size === 12, `${store.deals.size}`);
  check("no deal ever carries an amount", [...store.deals.values()].every((d) => !("amount" in d.properties)));
  const d5 = [...store.deals.values()].find((d) => d.properties.dealname.includes("Aarti Mehta"))!;
  check("deal named with priority, project and caller", /^\[P\d+\] 4BHK · Koregaon Park · 2,400 sq ft — Aarti Mehta$/.test(d5.properties.dealname), d5.properties.dealname);
  check("deal ↔ contact association uses HUBSPOT_DEFINED type 3", d5.associations?.[0]?.types?.[0]?.associationTypeId === 3 && d5.associations[0].types[0].associationCategory === "HUBSPOT_DEFINED");
  check("notes: one per call, attached to contact (202) and deal (214) when there is one", store.notes.size === 21 && [...store.notes.values()].some((n) => n.associations?.some((a) => a.types[0].associationTypeId === 214)) && [...store.notes.values()].every((n) => n.associations?.[0].types[0].associationTypeId === 202));
  const note = [...store.notes.values()].find((n) => n.properties.hs_note_body.includes("Aarti"))!;
  check("note carries summary, gate quotes, transcript and a dashboard link", ["Outcome: Qualified", "The gate", "Transcript", "/admin/calls/"].every((s) => note.properties.hs_note_body.includes(s)));
  check("T09 existing-client complaint: contact + note, no deal", ![...store.deals.values()].some((d) => d.properties.dealname.includes("Sheetal")) && [...store.notes.values()].some((n) => n.properties.hs_note_body.includes("Existing client")));

  // idempotency: pushing everything again creates nothing new
  const before = [store.contacts.size, store.deals.size, store.notes.size];
  for (const r of await q("select id from calls")) await pushCallToHubspot(r.id);
  check("re-push is idempotent (no duplicate contacts, deals or notes)", [store.contacts.size, store.deals.size, store.notes.size].every((n, i) => n === before[i]));

  // override a real lead to a decline → deal moves to closed/lost
  const t05 = (await q("select id from calls where provider_call_id = 'vaani-T05'"))[0].id;
  await q("update assessments set decision = 'NOT_QUALIFIED' where call_id = $1 and is_current", [t05]);
  await pushCallToHubspot(t05);
  check("decision changed to a decline → deal closed/lost, not deleted", d5.properties.dealstage === "closedlost" && store.deals.size === 12);

  // failure then recovery without duplicates
  const t20 = (await q("select id from calls where provider_call_id = 'vaani-T20'"))[0].id;
  await q("delete from hubspot_syncs where call_id = $1", [t20]);
  const phoneContacts = store.contacts.size;
  faults.failNotes = true;
  const bad = await pushCallToHubspot(t20);
  const row = (await q("select * from hubspot_syncs where call_id = $1", [t20]))[0];
  check("a HubSpot failure is recorded (contact + deal kept, note missing, error saved)", bad.status === "failed" && row.status === "failed" && !!row.contact_id && !!row.deal_id && !row.note_id && /403/.test(row.last_error));
  check("failed call is queued for the sweep", (await callsNeedingHubspot(50)).includes(t20));
  const dealsAfterFail = store.deals.size;
  faults.failNotes = false;
  const ok = await pushCallToHubspot(t20);
  const row2 = (await q("select * from hubspot_syncs where call_id = $1", [t20]))[0];
  check("retry finishes the job without duplicating contact or deal", ok.status === "synced" && row2.note_id && store.deals.size === dealsAfterFail && store.contacts.size === phoneContacts);
  check("a bad token fails cleanly", await (async () => { process.env.HUBSPOT_ACCESS_TOKEN = "wrong"; const r = await inspectHubspot(); process.env.HUBSPOT_ACCESS_TOKEN = "test-token"; return !r.ok && /401/.test(r.error ?? ""); })());

  // repeat caller with a real number: second qualified call joins the existing deal instead of opening another
  const rep = async (id: string) => { const c = await ingestCall({ providerCallId: id, phone: "+919000000098", startedAt: new Date().toISOString(), durationSec: 120, endReason: null, status: "answered", transcript: [{ speaker: "caller", text: "hi" }], recordingUrl: null, raw: {}, source: "webhook" });
    await gradeCall(c!.id, { grader: (async () => ({ grading: structuredClone(SEPTEMBER[0].grading!), model: "golden", inputTokens: 1, outputTokens: 1 })) as never }); return c!.id; };
  const dealsBefore = store.deals.size, notesBefore = store.notes.size;
  const r1 = await rep("repeat-1"), r2 = await rep("repeat-2");
  const [s1, s2] = await Promise.all([q("select * from hubspot_syncs where call_id = $1", [r1]), q("select * from hubspot_syncs where call_id = $1", [r2])]);
  check("repeat caller: same contact, ONE deal (second call joins it)", s1[0].contact_id === s2[0].contact_id && s1[0].deal_id === s2[0].deal_id && store.deals.size === dealsBefore + 1, `${store.deals.size - dealsBefore} new deal(s)`);
  check("…but each call still gets its own note", store.notes.size === notesBefore + 2);

  // a browser/web call has no phone number: mirrored by name, one contact per call, no phone filter sent
  const web = await ingestCall({ providerCallId: "webrtc-1-abc", phone: "unknown", startedAt: "2026-10-10T13:31:03.499Z", durationSec: 127, endReason: null, status: "answered",
    transcript: [{ speaker: "caller", text: "I am Vaibhav, a 2BHK in Hinjewadi." }], recordingUrl: null, raw: {}, source: "webhook" });
  await gradeCall(web!.id, { grader: (async () => ({ grading: { ...structuredClone(SEPTEMBER[0].grading!), extracted: { ...SEPTEMBER[0].grading!.extracted, name: "Vaibhav Tiwari", locality: "Hinjewadi" } }, model: "golden", inputTokens: 1, outputTokens: 1 })) as never });
  const webRow = (await q("select * from hubspot_syncs where call_id = $1", [web!.id]))[0];
  const webContact = store.contacts.get(webRow?.contact_id);
  check("web call without a phone number is still mirrored (contact + note + deal)", webRow?.status === "synced" && !!webRow.deal_id && !!webRow.note_id, webRow?.last_error ?? "");
  check("…the contact is named, and carries no phone property", webContact?.properties.firstname === "Vaibhav" && webContact.properties.lastname === "Tiwari" && !("phone" in webContact.properties));
  const contactsBefore = store.contacts.size;
  await pushCallToHubspot(web!.id);
  check("…and re-pushing it creates no second contact", store.contacts.size === contactsBefore);
  const emptyWeb = await ingestCall({ providerCallId: "webrtc-2-empty", phone: "unknown", startedAt: "2026-10-10T14:00:00.000Z", durationSec: 1, endReason: null, status: "missed", transcript: [], recordingUrl: null, raw: {}, source: "webhook" });
  await gradeCall(emptyWeb!.id, { grader: grader as never });
  check("a no-number, no-conversation call is skipped (nothing to record)", (await q("select status from hubspot_syncs where call_id = $1", [emptyWeb!.id]))[0]?.status === "skipped");

  console.log(`\n${calls.length} HubSpot API calls. ${fails.length ? "FAILED: " + fails.join("; ") : "ALL CHECKS PASSED"}`);
  server.close();
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

# Aangan · Enquiry Desk

Every phone enquiry to Aangan Studio gets answered, day or night, by a Vaani voice agent.
Gemini then grades the call against Nikhil's rubric (`qualified.md`), and deterministic code decides.
Qualified leads reach a designer by email within about a minute, with everything already asked.
Every caller also lands in **HubSpot** (contact + note + deal) so the founder has one view of the whole business, while designers work in this dashboard.
Separately, **every call** (answered, missed, dropped, qualified or not) sends a summary email to one address of your choice.
Nikhil gets a dashboard showing every call, its verdict, what the system costs, and what it generates.

```
Call → Vaani (answers, qualifies lightly, deflects price) → webhook → Neon Postgres
     → Gemini (verdict + evidence per criterion) → lib/decision.ts (the rules)
     → designer email / escalation / callback queue → dashboard
```

## Run it now (demo mode, no accounts needed)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3100. With no `DATABASE_URL` set, the app replays the 20 September
phone transcripts through the real pipeline, using hand-checked golden gradings. The clock is
pinned to 26 Sep 2026, 6 pm. Add `GEMINI_API_KEY` to `.env.local` and the **Try the grader**
page will grade any pasted conversation live. That includes the WhatsApp and web-form samples.

```bash
npm run eval
```

The offline eval runs the golden gradings through the decision rules (20/20 today).
`npm run eval:live` asks Gemini to grade all 40 enquiries and reports per-criterion agreement.

## Screens

| Screen | The one thing it must make obvious |
|---|---|
| **Today** | How many calls came in, how many were answered, how many reached designers, and what needs Nikhil |
| **Needs you** | What to close today: escalations, callbacks, leads no designer picked up, areas to confirm, nurture |
| **Transcripts** | Every conversation word for word, searchable across all calls, with the decision beside it |
| **Calls** | Every call with its gate (services check + 5 criteria as ✓ ? ✗), decision, priority and designer status |
| **Call detail** | Why it was decided. Click a criterion to see the caller's exact words highlighted in the transcript |
| **Cost & value** | Spend by component, cost per call and per qualified lead, the 200/500/1,000 scenarios, and the leak |
| **Try the grader** | Paste any enquiry and watch it graded. This is how WhatsApp and the web form plug in later |
| **Settings** | Call-report recipient, service areas, lead-time rules, designer roster and routing, unit prices, assumptions |
| **Why it works this way** | Nikhil's FAQ, open questions where the case files disagree, decision records |

## Deploy (GitHub + Vercel)

**Make the GitHub repo private first.** It contains the studio's internal pricing guide (`context/pricing.md`), which is meant to stay confidential.

```bash
bash scripts/deploy.sh vai333/aangan_studio
```

The script pushes to GitHub, creates the Vercel project `aangan-studio`, copies every variable from `.env.local` to Vercel (`scripts/vercel-env.sh`), deploys, sets `APP_URL` to the production address, redeploys, and prints the Vaani webhook URL. It prompts for the GitHub and Vercel logins on first run. For a non-interactive run, export `VERCEL_TOKEN` first.

Afterwards, in Vaani → Settings → Webhooks, paste the URL it printed (`npm run webhook:url` prints it again). The `?token=` part authenticates Vaani; it works whether or not Vaani signs its webhooks.

## Go live

**Already done for you:** the Vaani agent "Aangan Studio" exists on your account, with the prompt, greeting, call limits and 14 data fields to extract. `VAANI_API_KEY` and `VAANI_AGENT_ID` are in `.env.local`. To re-apply the prompt after editing it: `npm run vaani:setup`.

1. **Neon.** Create a project at console.neon.tech. Copy the **pooled** connection string into `DATABASE_URL`, then run `npm run db:migrate`.
2. **Sign-in.** Set `ADMIN_EMAILS`, `ADMIN_PASSWORD` (a long one) and `SESSION_SECRET`. The password is shared, so it suits a small team.
3. **Environment.** Fill in the rest of `.env.example`: `GEMINI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `CALL_REPORT_EMAIL`, `ACK_SECRET`, `CRON_SECRET`, `APP_URL`.
4. **Deploy to Vercel**, with the same variables. Run `npm run db:migrate` against Neon **before** deploying code that adds a table, or the dashboard errors until you do. `vercel.json` runs `/api/jobs/sweep` daily (the Hobby limit). On Pro, change it to `*/10 * * * *`. The sweep pulls any call the webhook missed, retries failed grading and unsent emails.
5. **HubSpot** (the founder's view). In HubSpot: Settings → Integrations → Private Apps → create an app with scopes `crm.objects.contacts.read/write`, `crm.objects.deals.read/write` and `crm.schemas.deals.read`. Put its token in `HUBSPOT_ACCESS_TOKEN`, then run `npm run hubspot:check`. It verifies the token and prints your pipeline and stage IDs; copy them into Settings → HubSpot. Click **Push existing calls** to backfill. What it creates:
   - **Contact** per caller, deduped by phone: name, phone, city (locality), lead status.
   - **Note** per call on the contact (and the deal): summary, outcome and reasons, the five criteria with the caller's quotes, captured facts, a link back here, and the full transcript.
   - **Deal** for qualified and nurture leads only, named like `[P83] 4BHK · Koregaon Park · 2,400 sq ft — Aarti Mehta`. **No amount is ever set** (the studio never quotes prices). A decision later overridden to a decline moves the deal to closed/lost.
   - A HubSpot outage never affects calls or designer emails. Failed pushes are retried by the daily sweep, up to 5 times.
6. **In the Vaani dashboard** (these three steps can't be done through their API):
   - **Settings → Webhooks:** add the URL from `npm run webhook:url` (`https://<your-app>/api/vaani/webhook?token=…`).
   - **Settings → Telephony:** provision a number, or connect your SIP trunk, and assign it to "Aangan Studio". Then publish the agent.
   - If Vaani also shows a webhook signing secret, put it in `VAANI_WEBHOOK_SECRET` (optional: the token already authenticates requests).
7. **Resend.** Verify the studio's sending domain and set `EMAIL_FROM`. Until then Resend only delivers to the account owner's own address, so use that for `CALL_REPORT_EMAIL` first. Add a webhook to `/api/resend/webhook` for `email.bounced` and put its secret in `RESEND_WEBHOOK_SECRET`.
8. **Smoke test.** Call the number, then watch the call and its transcript appear on **Transcripts**. If a webhook was missed, **Calls → Sync from Vaani** imports it.

Check the database layer yourself with `DATABASE_URL=postgres://localhost/… npm run test:hubspot` (HubSpot mirror against a local mock) and `DATABASE_URL=postgres://localhost/… npm run test:e2e`. It refuses to run against anything but a local database, because it truncates tables.

## What's verified and what isn't

- **Transcripts reach the dashboard two ways:** the post-call webhook (fast path) and the Call History API sync. The sync could not be tested against real data. Vaani's `/api/call-history` returned a server error ("Invalid client_id format") for this account before any call existed. If it persists after the first real call, ask Vaani support; the webhook path doesn't depend on it.
- **HubSpot** was built from HubSpot's documented CRM v3 endpoints and tested against a local mock of them (17 checks), not your real portal. Run `npm run hubspot:check` with your token first. Two things to confirm in a live portal: that the note, deal and contact association IDs (3, 202, 214, from HubSpot's docs) are accepted, and that your `hs_lead_status` options match (if not, the contact is still created without it).
- **Grader accuracy** on the 40 September enquiries: 34/40 with the first prompt and 36/40 after the first rewrite. A later wording fix cleared four specific misses in a spot-check, but a full re-run could not finish: Gemini's free tier returned quota (429) and "high demand" (503) errors. Tuning was done on the same 40 cases, so treat it as optimistic. Re-run `npm run eval:live`; enabling billing on the Gemini key avoids the free-tier limits.
- **Vaani field names** come from Vaani Research's public docs (docs.vaanivoice.ai, checked 10 Oct 2026):
  - `call_postprocessing` with `data.{call_id, call_duration (ms), transcript, recording_url, end_reason}`
  - `call_ended`
  - `X-Vaani-Signature` = HMAC-SHA256 of `"{timestamp}.{body}"`
- **Also accepted:** the vaaniai.io `call.completed` shape.
- **Unverified, marked `[VERIFY IN VAANI DOCS]` in code:**
  - the caller's number (it's in the Call History API, not the webhook; set `VAANI_CALL_DETAILS_URL`)
  - Marathi support
  - whether inbound missed calls emit any event. The code infers missed and dropped calls from duration and caller speech.
- **The nine checks** (Part A) come from your session notes and were not supplied, so they are
  deliberately not invented. See `docs/part-a.md`.

## Layout

```
app/api/vaani/webhook   verify → dedupe → store → 200 in <5 s → grade in after()
app/api/jobs/sweep      retries (stuck/failed grading, unsent emails)
app/api/resend/webhook  bounce → escalation
app/admin/*             dashboard (server components; signed-cookie admin session)
app/ack/[token]         designer "I've got this" (POST, so link scanners can't ack)
lib/decision.ts         qualified.md as code — the gate
lib/priority.ts         0–100 queue order; never overrides the gate
lib/grading/            Gemini prompt, JSON schema, embedded case files
lib/pipeline.ts         pure: grading → decision → email/escalation/costs (shared by live, demo, evals)
lib/vaani/adapter.ts    payload normalisation, signature, missed/dropped classification
lib/vaani/api.ts        Vaani REST client (call history, transcripts, caller number)
lib/vaani/sync.ts       imports calls + transcripts from Vaani's Call History API
lib/hubspot/            HubSpot client (contacts, notes, deals) and the per-call mirror
lib/db.ts               Postgres access (Neon serverless driver; node-postgres for localhost)
db/migrations           Postgres schema (Neon)
prompts/                Vaani agent prompt, Gemini grader prompt
evals/                  T01–T20, W01–W10, F01–F10
docs/                   Part A, architecture, costing
```

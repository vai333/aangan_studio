# Architecture & decision records

```mermaid
flowchart LR
  C[Caller] -->|PSTN| V[Vaani voice agent\nprompt: vaani_agent_prompt.md]
  V -->|transfer_call| S[Senior on call]
  V -->|signed webhook| W[/api/vaani/webhook\nverify · idempotency · store/]
  W --> DB[(Neon Postgres\nserver-side access only)]
  W -->|after()| G[Grading job]
  G -->|transcript + case files| GM[Gemini\nstrict JSON schema]
  GM --> G
  G --> D[lib/decision.ts\nqualified.md as code]
  D --> P[lib/priority.ts]
  D -->|QUALIFIED*| E[Resend → designer\n+ cc leads inbox, VIP cc Nikhil]
  D -->|ESCALATION / service recovery| X[Resend → Nikhil]
  D -->|INCOMPLETE| Q[Callback queue]
  D -->|every call: contact + note, deal if qualified| HS[HubSpot\nfounder's view]
  D -->|every call| R[Resend → call-report address\nsettings.call_report_email]
  E -->|Acknowledge link| A[/ack/token/]
  E -.bounce.-> RW[/api/resend/webhook/] --> Q
  CR[Vercel Cron /api/jobs/sweep] -->|retry failed grading & email| G
  DB --> UI[Admin dashboard\nsigned-cookie sign-in]
  VH[Vaani Call History API] -->|sync: transcripts + caller number| DB
```

## Decision records (Tree of Thoughts, condensed)

Each decision records three branches, which one was kept, and why. The scores (1–5) cover
caller/Nikhil value, fidelity to the files, build effort, running cost and risk. They are summarised here.

### 1. In-call vs post-call qualification
| Branch | Proposer | Verdict |
|---|---|---|
| A. Vaani grades live and decides | Sales | Pruned. Every turn gets slower, the decision can't be audited, and a mis-grade can't be undone mid-call |
| B. Vaani only records; grading and qualifying happen after the call | Engineer | Pruned. Fidelity ≤2: qualified.md says to *ask one question on the call*, and declines must be graceful in the moment |
| **C. Light rules live, authoritative grading after the call** | Architect | **Chosen** |

**Record:** Vaani does what only a live conversation can do: one clarifying question, the pricing
line, kind declines, and escalation. After the call, Gemini judges each criterion with quotes and
code applies qualified.md. This keeps the call natural and the verdict auditable.

### 2. Scoring model
| Branch | Verdict |
|---|---|
| Weighted score with a threshold | Pruned. Fidelity ≤2: Nikhil's rubric is a gate, and a large project could "outscore" a failing criterion |
| LLM outputs the final decision | Rejected. It can't be audited and drifts between model versions |
| **Gate per criterion (pass/unclear/fail + evidence) → deterministic decision; separate 0–100 priority for queue order** | **Chosen** |

**Backtrack:** the first pass treated the services.md exclusions (restaurants, decor-only) as part
of criterion 1. That blurred two sources, so it was split into a "Gate 0: services" check.

### 3. Handoff: email vs Telegram vs dashboard-only
**Chosen: email.**
- **What email does well:** it is searchable, has threads and cc, needs no installs for 14
  designers, and leaves an audit trail.
- **Where Telegram is better:** instant push and read receipts.
- **How email covers those gaps:**
  - The subject line triages the lead from the lock screen.
  - The email arrives within a minute.
  - An Acknowledge link acts as the read receipt.
  - Any lead unacknowledged after 2 hours is flagged on the dashboard.

**Dashboard-only** was rejected because designers would have to poll it.

### 4. Routing
**Chosen:** the least-loaded active designer for the segment (residential/commercial), computed
statelessly from the last 7 days of handoffs. The leads inbox is cc'd, and Nikhil is cc'd on VIP referrals.

**Rejected:** a single inbox, which recreates the "forwarded with no context" pile, and manual
assignment, which fails at 9pm.

### 5. Data model
The tables are calls, callers, assessments (versioned, with `is_current`), overrides (an
append-only log that doubles as eval data), handoffs (unique per call), escalations (unique per
call and kind), cost_events, webhook_events (the idempotency ledger) and settings.

**Rejected:** a single `leads` table. It can't hold a re-decision history or merged calls.

### 6. Failure modes
| Failure | Handling |
|---|---|
| Vaani retries (5×) | `webhook_events.idempotency_key` is unique, so duplicates return 200 |
| Out-of-order `call_ended` / post-call | Post-call upserts and wins; `call_ended` only creates a placeholder, which the sweep grades as missed/dropped after 10 min |
| Two graders on one call | `claim_call_for_grading()` makes grading single-flight |
| Gemini timeout or invalid JSON | 30 s timeout. A schema-validated retry runs once, with the parse error fed back. The job retries 3× via the sweep; after that the call goes to the callback queue so it is never lost |
| Email failure | Resend `Idempotency-Key`; 3 in-process attempts with backoff, then the sweep retries up to 5×. Applies to handoffs and call reports. A report is unique per call, so a retried webhook can't send it twice |
| Email bounce | The Resend webhook marks the handoff bounced and opens a callback to reassign it |
| Vaani outage | **[ASSUMPTION]** Configure call-forwarding on the studio number to the front desk mobile when Vaani doesn't pick up. Missed calls still land in the queue |
| HubSpot down / token revoked | Push is wrapped so it can never fail the call. `hubspot_syncs` keeps whatever was created (contact, deal, note ids), so a retry resumes instead of duplicating. The sweep retries up to 5× |
| Stuck `running` job | The sweep releases it after 10 min |

### 7. Dashboard information architecture
| Screen | The question it answers in 5 seconds |
|---|---|
| Today | "Is the desk working, and what needs me?" One sentence, five numbers |
| Needs you | Five lanes, ordered by the cost of waiting |
| Calls | Six tiles per row show *why*, not just *what* |
| Call detail | Click a verdict to see the caller's words highlighted |

The shape of each tile carries the verdict as well as its colour (✓ / ? / ✗), so it stays readable under colour-blindness.

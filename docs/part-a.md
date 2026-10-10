# Part A: Case digest, Automation brief, Components map

## Case digest

**The ask, in Nikhil's words:** "Every enquiry must get answered in five minutes, day or night. The
ones worth my designers' time should reach them with everything already asked. And the system
should be able to quote our standard per-square-foot pricing so people don't have to wait for that."

**The numbers (from the brief):**
- ~200 enquiries a month
- ~48% get no response within 48 hours
- An answer within 1 hour converts at 4× the rate of a next-day answer
- ~33% arrive outside 10am–7pm
- The front desk is 2 people
- The average project is ₹8–14 lakh
- The studio has 60 people, 14 of them designers

**Scope:** incoming phone calls only. WhatsApp and the web form are out of scope; the design
only notes how it extends to them (see "Try the grader").

**What each file is the source of truth for:**

| File | Governs |
|---|---|
| `services.md` | What we do and don't do, the service area, the ~3,000 sq ft office cap, timelines (design 3–4 weeks, execution 8–16, nothing under 6 weeks) |
| `qualified.md` | The five criteria, the boundary rules, and what does NOT disqualify |
| `pricing.md` | Internal ranges, the list of things the agent must never say, and the only approved pricing line |
| Transcripts T01–T20, W01–W10, F01–F10 | Test set, plus the tone reference (T02, T10, T11 are the front desk at its best) |

## Automation brief

**Pain.**
- Half of all enquiries go unanswered for two days (W02, W05 and W08 were all missed for days).
- A third arrive when nobody is at the desk (T08 at 10:47pm: missed, callback failed).
- Leads that do get through reach a designer "as a forwarded message with no context".
- T16 called, was promised a callback, and got nothing.

**Users.**
- *Callers*: homeowners and small-office founders in Pune and PCMC who want a quick, honest answer.
- *Designers*: they need a lead they can act on without re-asking.
- *Nikhil*: he needs to see what's happening and what it costs, without pulling numbers by hand.

**Outcome (measurable).**
- 100% of calls answered by a person or the agent.
- First response in seconds; the designer email under 2 minutes after hang-up.
- No qualified lead reaches a designer without a summary and answers to all five criteria.
- Every qualified lead acknowledged within 2 hours.
- Existing-client complaints escalated within 15 minutes.
- Monthly cost and pipeline visible on a page, never in a spreadsheet.

### The journey today

1. A call arrives. **Break:** if it comes before 10am, after 7pm, at a weekend, or while both staff
   are busy, it goes unanswered (T08). There is no voicemail.
2. The front desk answers and asks good questions (T01, T02). **Break:** the answers live in
   someone's head or a note that gets lost (T16: "I don't see a note").
3. Price requests. These are handled well (T02, T13), but the logic sits in one person's head.
4. The handoff to a designer. **Break:** "a forwarded message with no context", so the designer's
   first call re-asks everything.
5. The designer calls back, sometimes the next day. **Break:** the 4× conversion lift is lost.
6. Existing clients complain on the same line (T09). **Break:** this relies on the front desk
   recognising the situation and finding a senior person.
7. Nikhil pulls the numbers by hand each month.

### The journey tomorrow

1. **Ring.** Vaani answers in seconds, at any hour, in English or Hindi (Marathi to be verified)
   and says it is an AI if asked.
2. **Talk.** One question at a time: what, where, size, state, when, who, name, source and slot.
   - It asks one clarifying question if criterion 1, 2 or 3 is unclear.
   - It uses the approved pricing line.
   - It closes kindly using the front desk's own wording.
   - Existing clients are escalated or transferred immediately.
3. **Hang-up.** A signed webhook arrives and is stored idempotently. A dropped call that is
   redialled within 30 minutes is merged with the redial.
4. **Grade.** Gemini returns a verdict for each criterion, with quotes. `lib/decision.ts` applies
   qualified.md, and a 0–100 priority sets the order of the queue.
5. **Hand off.** Within about a minute the least-loaded designer for the segment gets an email:
   `[QUALIFIED · P67] 3BHK Kothrud · 1,400 sq ft · by Mar`, with a "don't re-ask" block and an
   Acknowledge link.
6. **Call report.** Every call, qualified or not, also sends a summary email (outcome, why, the gate, what was captured, a dashboard link) to one configured address, so there is a running log in a normal inbox.
7. **Safety nets.**
   - No acknowledgement within 2 hours → flagged on *Needs you*.
   - Missed, dropped or unclear calls → the callback queue.
   - A complaint → Nikhil's inbox.
8. **Nikhil** opens *Today* and sees the whole month in five seconds, cost included.

## Nine checks

The nine checks come from the session notes, and the list was not included with the case files.
**I have not invented them.** Send the list and each check will be worked through with
evidence. The Cut is already clear, though:

### The Cut: price quoting

- **The ask:** Nikhil wants the system to "quote our standard per-square-foot pricing".
- **Why it's cut:** pricing.md forbids exactly that: "No number from this guide should be quoted
  to a client", with any range, "starts at" and "for a 2BHK it's typically" banned outright. The
  ranges are "indicative only, varies by site", so a number given before a site visit becomes the
  number a client holds the studio to.
- **Evidence the alternative works:** in T02 and T13 callers asked twice for a ballpark, were
  deflected, and booked anyway ("Okay, fair enough. Let's book it." / "Fine. Let's book then.").
- **What was built instead:** the approved line plus an instant offer to book, with price questions
  never counted against a caller. The voice agent is never given the price list, so it cannot leak it.
- **Note:** the brief's Cut instruction names "Arjun". This is read as a typo for Nikhil.

## Components map

| Stage | What it is |
|---|---|
| **Trigger** | Any incoming call to the studio number, at any hour |
| **Input** | Caller audio and caller ID go to Vaani, which produces the transcript (plus recording URL, duration and end reason) |
| **Context** | `services.md`, `qualified.md`, the pricing deflection rule (the voice agent gets the line only; the grader gets `pricing.md` to judge volunteered budgets), the admin area list, and prior calls from the same number |
| **Processing** | Webhook: verify the signature, check the idempotency ledger, upsert caller and call, merge dropped calls, then run the grading in `after()`. A daily sweep retries anything that failed |
| **AI** | Vaani holds the conversation. Gemini judges each criterion with evidence, extracts the handoff fields and writes the designer summary. Code makes the decision |
| **Output** | Designer email (Resend), a call-report email for every call, a HubSpot contact + note (and deal for real leads) for the founder, dashboard record, escalation email and queue item, callback queue, and a cost ledger entry for every call |

**Later channels:** a WhatsApp Business webhook and the web form each turn a message into a
transcript and enter at **Input**. Everything after that is unchanged. *Try the grader* already
grades W01–W10 and F01–F10.

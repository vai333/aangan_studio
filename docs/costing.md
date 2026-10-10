# Costing sheet (prices checked 10 Oct 2026)

| Item | Price used | Source | Status |
|---|---|---|---|
| Vaani voice | ₹5 / min, "all-in" developer access | vaaniresearch.com (homepage) | Confirmed for Vaani Research. vaaniai.io lists ₹3.20/min pay-as-you-go. **Confirm which Vaani the studio uses** |
| Gemini 3.5 Flash-Lite | $0.30 in / $2.50 out per 1M tokens | ai.google.dev/gemini-api/docs/pricing | Confirmed |
| Resend | Free up to 3,000 emails/month; Pro $20/month | resend.com/pricing | Confirmed |
| Vercel Pro | $20 / seat / month | vercel.com/pricing | Confirmed. Hobby is $0 but non-commercial |
| Neon Postgres | Free plan $0: 1 GB storage, 100 CU-hours/month, scales to zero after 5 min idle. Paid Launch is usage-based ($0.106/CU-hour, $0.35/GB-month) | neon.com/pricing | Confirmed. The free plan covers this workload; first query after idle adds a short cold start |
| Phone number rental | ₹500 / month | — | **[ASSUMPTION]** |
| USD → INR | ₹88 | — | **[ASSUMPTION]** |
| Vaani billing increment | per-second | — | **[ASSUMPTION]** |

**Per-call variable cost.** Average call length is 4.7 min (the T01–T20 mean).
- Vaani: 4.7 × ₹5 = ₹23.50
- Gemini: about 5,000 input + 900 output tokens = $0.00375 ≈ ₹0.33
- Email: ₹0 within the free tier. Each call now sends a report (and a qualified lead also a handoff), about 1.6 emails per call. That is ~320 a month at 200 calls, well inside Resend's 3,000/month and 100/day limits

| Calls / month | Vaani | Gemini | Email | Fixed | **Total** | **Per call** |
|---|---|---|---|---|---|---|
| 200 (today) | ₹4,700 | ₹66 | ₹0 | ₹2,260 | **₹7,026** | **₹35** |
| 500 | ₹11,750 | ₹165 | ₹0 | ₹2,260 | **₹14,175** | **₹28** |
| 1,000 | ₹23,500 | ₹330 | ₹0 | ₹2,260 | **₹26,090** | **₹26** |

## What the leak costs (brief numbers + labelled assumptions)

| Step | Value | Basis |
|---|---|---|
| Enquiries per month | 200 | Brief |
| No reply within 48 h | 48% → 96 | Brief |
| Conversion if answered < 1 h | 8% | **[ASSUMPTION]** |
| Conversion if answered next day | 2% (¼ of the above) | Brief: 4× |
| Extra projects per month if all 96 are answered fast | 96 × 6% ≈ 5.8 | Calculated |
| Average project | ₹11 L (midpoint of ₹8–14 L) | Brief |
| Revenue at stake | ≈ ₹63 L / month | Calculated |
| Gross margin | 25% | **[ASSUMPTION]** |
| **Margin at stake** | **≈ ₹16 L / month**, against ≈ ₹7,000 to run the desk | Calculated |

Even if the conversion assumptions are ten times too optimistic, the desk pays for itself many
times over. Every assumption is editable in **Settings → Business assumptions**, and the Cost &
value page recalculates live.

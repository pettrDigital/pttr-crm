# PETTR CRM — Session Handoff (status snapshot)

**Read `PETTR_CRM_DATA_SPEC.md` FIRST — it is the canonical *what* (rules, tiers, gate,
taxonomy, revenue, sources). This doc is only the *current status* layer on top of it:
what's built, what's half-built, what's decided, what's next. Do not re-explain the
system back to Ric — the spec already states it. Your job is to act on current status.**

---

## How we work (do not deviate)
- Ric pastes your prompts into **Claude Code (CC)**; CC executes against the repo; Ric
  brings results back. **You write prompts + provide judgment. You do NOT edit the repo.**
- **Distrust CC's "validated / passed / N-of-N / ground truth"** unless the test was
  GENUINELY BLIND (the answer was withheld from the thing being tested). Ric has caught
  fake ground-truth before. When CC says "I can't" (e.g. "can't call that API"), check
  whether it actually can — twice this session "can't" turned out to be "didn't try the
  right way" (8x8 recordings endpoint; AroFlo Postman call).
- Read-only diagnosis before any build. One comprehensive prompt > many round-trips.
- Verify at all THREE layers (spec §0): INGESTED -> MATERIALISED -> ORCHESTRATED.
  "Committed" ≠ "live." Most recurring bugs were green at one layer, red at another.
- Don't re-litigate settled decisions (they're in the spec). Don't reconstruct facts
  from memory — read the spec / re-run a verification query.

## Standing data rules (spec §1 — memorise)
- Revenue = `vw_job_invoiced.invoiced_total_ex` (line-summed ex-GST). Never quote notes /
  WC `sale_value` / pre-aggregates.
- Never edit BQ views — changes go to underlying tables. Sydney time. `~/crm-build` is truth.
- Phones normalise to E.164 `+61…` (the `+6161…` bug hid $430K). "Zero results" = silent-bug
  suspect.

---

## WHERE THINGS STAND (updated 2026-06-20)

### END-TO-END CASCADE FUNCTION — BUILT, FIRST RUN COMPLETE

- **Built**: `scripts/run-cascade.ts` (committed b876f5a + 7a69084). 9 steps per
  `docs/END_TO_END_FUNCTION.md` v2. Runs deterministic spine + AI seam (CC-mode),
  writes to staging (`crm_auto_classifications`), never `crm_lead_overrides`.
- **Dry-run**: inert (Step 4 read-only + Step 9 readout only).
- **Step 6**: dynamic MERGE routes matches to Account/COD via AroFlo customer_type.
- **First real run** (2026-06-20): ran `--scope=all` (full history, 22,619 opps).
  Spine verified clean (Completed+Invoiced count exact to BQ).
  - **T7.1** (Step 5): 101 signal leads evaluated → 0 matches (all structurally
    correct abstains — Mark Ford conflation guard, Ian Johnston/Sam Girvan backward
    window). Verified real, not a bug.
  - **T7.2** (Step 7): all 611 judgement leads classified (signal-based with
    CU/NFUR pre-pass). 112 Booked:completed_zero → Quote Only. See reconciliation doc.

### WC RECONCILIATION — COMPLETE (1,215 leads footed, zero unexplained gaps)

- **Population**: 1,215 CSV (ferg_csv_classifications) → 109 test excluded →
  1,095 mapped (3-way join) + 8 no-identity + 3 spine-gap. Every lead bucketed.
- **Classified**: 476 determined (gate) + 611 T7.2 classified + 6 system-missed
  conversions + 2 pending = 1,095 mapped. Zero unexplained.
- **Staging**: all classifications written to `crm_auto_classifications`
  (action='proposed' or 'system_miss'). Reconciliation table: `t7_reconcile_complete`.
- **Full doc**: `docs/t7_wc_reconciliation_full.md` — complete with Fergus
  comparison, adjudication buckets, and linker-miss metric.
- **Fergus comparison** (428 comparable leads where Ferg has a reason):
  T7 agrees or improves on 63% (79 agree + 104 Other decomposed + 15 Booked
  + 72 SNO/Price corrected). Genuine disagreement 14%. Ambiguous 4%.
- **Linker-miss rate**: 6/1,095 mapped (0.5%), $18,090 invoiced. See §7 of
  reconciliation doc.
- **Key Ferg findings**: SNO over-application (62), Other decomposition (104),
  Dropped Call content-gap (73), 6 invoiced leads called lost ($4,544).

### THE KEY FINDING: AUTONOMY GAP (conversion-orphan classes)

**The system does NOT self-capture conversion-orphans.** 6 real-job leads found
during reconciliation, ALL by manual interception, NONE by the system. On every
unattended run, the cascade function will misclassify real conversions as
non-conversions. **This is the most important finding from this run.**

4 orphan classes identified:

1. **Content-match orphans** (4 leads found: Mark Ford $466, Michael Kilborn $0,
   Aaron Simpson $0, John Gabor $792). Caller's name/address in Account job
   description, different client phone. Phone-based scans cannot find these.
   T7.1 has content_match signal but the conflation guard blocked Mark Ford.

2. **Clustering-window orphans** (2 leads found + 24 across full population,
   $42,829 total). 30-day window too tight for delayed bookings. Liz Manfredini
   ($8,855 at 31d) and Fong Loretta ($880 at 44d). The 31-45d band recovers
   6 invoiced leads ($16,698) with 60% precision.

3. **Conflation-guard frequency bug** — LIVE §17.1 VIOLATION. The guard in
   `t7_match_candidates.sql` excludes phones on 10+ Account descriptions.
   This is a frequency-based heuristic, banned by §17.1 (the Aaron Rule).
   Mark Ford was the proof: real $466 job blocked. The guard needs replacing
   with an explicit by-list exclusion.

4. **Known-staff-caller gap** (Donna Carey, 2 leads, $0). Dual-role person
   (staff + customer). is_internal checks CALLED DID, not CALLER phone.
   Needs a known_staff_callers mechanism. Low priority.

All 6 linked leads written to crm_t7_match_queue or crm_account_exclusions
with review_recommended=TRUE, needs_audit=TRUE. Pending rebuild to propagate.

### T7 — DONE, VALIDATED, DEPLOYED

- **T7.1 Matcher**: 13 matches from 560 eligible, write path tested,
  review_recommended=TRUE on all. Candidate gen: hybrid mislabel buckets,
  signal-based eligibility, email contamination fixed, NAME/CONTENT/SUBURB
  MATCH pre-computed. Audit queue: `docs/t7_match_audit_queue.md`.
  **RECALL GAP**: caught 0 of 6 real-job orphans in the first real run.
  Content/name-match recall insufficient; conflation guard suppresses real PMs.

- **T7.2 Classifier**: 89.1% on 367 GT. Config locked: flat prompt +
  CU/NFUR pre-pass + apprentice→Spam + NJR→internal + 0.70 conf routing.
  See `t7_taxonomy_spec.md §10`.

- **T7.1→T7.2 Wiring**: deployed rev 00031/00032, 2x rebuild proven.
  JN propagation (Account §6 + COD post-graph UPDATE keyed wc_lead_id).
  13 matches live: 9 Completed+Invoiced ($6,907), 3 Booking Cancelled,
  1 Booked:$0. Dual booking rate: confirmed=819, total=829, delta=+10.

- **is_internal**: lkp_did_trade.is_internal → lead_timeline is_internal_did.
  resolveNqNbAllowedSet removes NJR when has_internal_touch=FALSE.

### OUTSTANDING — AUTONOMY GAP (the real next priority)

These are the gap between "hand-fixed reconciliation" and "correct unattended
system." Until these are deterministic rules, the cascade function misclassifies
real conversions on every run.

1. **Content-match candidate-gen signal** — T7.1 needs a content-match path for
   leads where the caller's name/address appears in an Account job description
   with a different client phone. Currently invisible to phone-based matching.

2. **Replace conflation frequency-guard with by-list** per §17.1 — the 10+
   description threshold in `t7_match_candidates.sql` is a frequency heuristic.
   Replace with an explicit list of known high-volume phones (strata agency
   main lines). The current guard is a live §17.1 violation.

3. **Clustering-window widen-or-post-pass** — 24 leads/$42,829 orphaned by
   the 30-day window across full population. Options: widen to 45d (best
   signal:noise), or add a post-clustering phone-match pass for gap_based
   leads. Measure false-merge risk before implementing.

4. **Known-staff-caller mechanism** — separate from test_numbers (staff can
   also be customers). Sets has_internal_touch=TRUE when CALLER phone is on
   the list. Low priority (1 phone, 2 leads, $0).

### OUTSTANDING — CARRIED ITEMS

- T7.1 backward window: Ian Johnston (job -2d), Sam Girvan (job -76d, repeat).
  Forward-only window misses jobs created just before the lead.
- Step 6 seam JSON not §3-compliant (Cowork swap blocker)
- Dual-classification metric view deferred (build before auto-output surfaced)
- Payment regex false positives (fires on quotes, not collections)
- Empty keyword_rules table (0 operational rules)
- Garbled-call gate fix (content exists but meaningless)
- vw_lead_enriched fanout (crm_account_exclusions dupes — 1 known: Kira Dargin)
- vw_accounts repoint (still uses banned task_invoices_total_ex)
- Finish classifying remaining 444 NQ/NB + 94 Booked:completed_zero

### DONE & committed (earlier sessions + this one)

- **End-to-end cascade function** (`scripts/run-cascade.ts`, commits 7a69084 +
  b876f5a). 9 steps, deterministic spine + AI seam. Dry-run inert. Step 6
  dynamic MERGE. Writes to staging table, never crm_lead_overrides.
- **Lead interaction timeline (UI)** — calls + per-call transcripts, SMS,
  task-emails, OHQ, WC forms, Outlook (3 paths). Verified, committed.
- **Recording gap diagnosed** — ~25% mobile-forwarded, ~75% capture ceiling.
- **WC reconciliation population** — 1,057 leads, 3-way join, foots to 1,215.
  `t7_recon_classify_input` materialised with full timelines.
- **6 orphan fixes** — written to crm_t7_match_queue / crm_account_exclusions
  with review_recommended=TRUE. Pending rebuild to propagate.
- **Clustering-window finding** — 24 leads/$42,829 sized across full population.
  Window-band analysis (31-45d/46-60d/61-100d) with precision metrics.

### HALF-BUILT (the dangerous category — looks done, isn't)

- **§5.1 Account / SMS-resident-phone link tier.** Exclusion flags written
  (232 opps) but NOT job links (jobnumber=NULL on all 232). Leads are out of
  COD metrics but not matched to Account jobs. **Highest-$ item: 977 leads / $6.1M.**
- **"Build A"** (materialised full content into lead_timeline, renamed Missed→
  Unanswered). Table rebuilt for verification but NOT committed, NOT deployed,
  UI regression NOT checked. CC-as-classifier reads new columns; production
  classify.ts does NOT.

### NOT BUILT

- §2.6 Correspondence coverage hole (3 leaks)
- §5 JN-from-email-body tier (316/507 task emails carry extractable JN)
- T7 production wiring (proposal queue, confirm/reject UI, scheduler)

### SETTLED FACTS (don't re-investigate)

- `join=tasknotes` ingest WORKS (107,378 notes / 23,876 jobs)
- SMS reaches us as MessageMedia reply-notification emails
- AroFlo task emails = raw_emails_sent to the AroFlo task address

---

## WHAT T7 IS (so it's never re-derived)

T7 does **BOTH** from one content read: (1) **MATCH** — proposes which job an opp
links to; (2) **CLASSIFY** — proposes funnel sub-status (spec §4 taxonomy).
PROPOSE-only, human/audit above it. Bottom rung of §5 cascade — runs on RESIDUE.

### Two channels (the cost model — not two systems)
- **CC-as-classifier** = free (Ric's Claude Code plan). Used NOW for dev + validation.
- **Production `classify.ts`** = paid OpenAI calls, wired LAST once proven.
- **Rule: validate the EXACT input production will run on.**

### Circularity guard
Withhold whatever output is being graded. Overrides applied in API route, not
baked into BQ tables.

---

## RECOMMENDED NEXT STEP

**Close the autonomy gap** — make the 4 orphan classes self-capturing:
1. Replace conflation frequency-guard with by-list (§17.1 enforcement)
2. Add content-match candidate-gen for name/address in Account job descriptions
3. Evaluate clustering-window widening (45d, measure false-merge impact)
4. Then: finish classifying the remaining 506 opps (or let the fixed function do it)

The AroFlo API call (§2.6 correspondence verification) is still the unblocking
move for the correspondence coverage hole — but the autonomy gap is now higher
priority because it causes silent misclassification on every run.

## Key paths

- Spec: `~/crm-build/docs/PETTR_CRM_DATA_SPEC.md` (CANONICAL)
- Cascade function: `scripts/run-cascade.ts` (9 steps, committed)
- Cascade spec: `docs/END_TO_END_FUNCTION.md` (v2)
- Reconciliation: `docs/t7_wc_reconciliation_full.md` (partial, honest)
- T7: `t7-classifier.ts` / `classify.ts` (production) / CC-as-classifier
- Timeline build: `bigquery/build_lead_timeline.sql`
- Tables: `lead_timeline`, `lead_gate`, `opportunities`, `crm_account_exclusions`,
  `crm_t7_match_queue`, `crm_auto_classifications`, `t7_recon_classify_input`
- Firestore: `crm_lead_overrides`, `crm_match_overrides` (keyed by stable keys,
  NEVER opportunity_id)
- BQ: `pttr-taskdata`, `ds_crm`/`ds_aroflo`/`gd_WhatConverts`, `--location=US`
- Orchestrator: deploy via `deploy.sh` (committing SQL != deployed)

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

## WHERE THINGS STAND (updated 2026-06-19)

### T7 — DONE, VALIDATED, DEPLOYED

- **T7.1 Matcher**: 13 matches from 560 eligible, write path tested,
  review_recommended=TRUE on all. Candidate gen: hybrid mislabel buckets,
  signal-based eligibility, email contamination fixed, NAME/CONTENT/SUBURB
  MATCH pre-computed. Audit queue: `docs/t7_match_audit_queue.md`.

- **T7.2 Classifier**: 89.1% on 367 GT. Config locked: flat prompt +
  CU/NFUR pre-pass + apprentice→Spam + NJR→internal + 0.70 conf routing.
  See `t7_taxonomy_spec.md §10`.

- **T7.1→T7.2 Wiring**: deployed rev 00031/00032, 2× rebuild proven.
  JN propagation (Account §6 + COD post-graph UPDATE keyed wc_lead_id).
  13 matches live: 9 Completed+Invoiced ($6,907), 3 Booking Cancelled,
  1 Booked:$0. Dual booking rate: confirmed=819, total=829, delta=+10.

- **is_internal**: lkp_did_trade.is_internal → lead_timeline is_internal_did.
  resolveNqNbAllowedSet removes NJR when has_internal_touch=FALSE.

### T7 — AWAITING

- **13 match audit**: review_recommended=TRUE. Review before clearing.
- **WC reconciliation rebuild**: re-join at ~1,100 leads (phone+email
  fallback), exclude 117 test leads, full per-lead table for Fergus.
  928-lead version at `docs/t7_wc_reconciliation_full.md`.

### OUTSTANDING (non-T7)

- Payment regex false positives (fires on quotes, not collections)
- Empty keyword_rules table (0 operational rules)
- Garbled-call gate fix (content exists but meaningless)
- Step 8: production engine + scheduler
- vw_lead_enriched fanout (crm_account_exclusions dupes)
- vw_accounts repoint (still uses banned task_invoices_total_ex)
- 6 genuine WC spine gaps + 5 non-8x8 recording gaps

### DONE & committed (earlier sessions + this one)
- **Lead interaction timeline (UI)** — calls + per-call transcripts, SMS, task-emails,
  OHQ, WC forms, Outlook (Path A customer-email / B JN-anchored / C guarded subject-thread).
  Verified on real leads, no blanking. Committed (commit d42293d bundled several fixes).
- **Fixed & committed:** `wc_leads` silent-failure (was blanking ALL interactions);
  leads search-by-ID (PH-/WC-/EM-/JN- + last-9-digit phone); per-call WC transcript
  resolution (was showing cluster-primary's transcript on every call).
- **Recording gap diagnosed (NOT a bug, spec §2.1):** ~25% of answered calls are
  forwarded-to-mobile -> structurally unrecorded by 8x8 (per-extension recording bypassed).
  ~75% capture, ~70% transcript coverage ceiling. Confirmed via direct 8x8 API (0/15 gap
  calls exist) + 92.7% zero-leg correlation. **Implication: a call with no transcript is a
  NORMAL touch (metadata only), not missing data / not an error.**
- **WC reconciliation:** coverage sound (95.7% spine match; gaps were a norm_phone-vs-
  contact_phone_number query artifact, not real misses). WC recordings/transcripts ARE
  ingested. 1 genuine unmatched lead (Chris Kelsey $980 — a T7 content-match case).

### HALF-BUILT (the dangerous category — looks done, isn't)
- **§5.1 Account / SMS-resident-phone link tier.** Wrote the EXCLUSION FLAGS (232 opps
  stamped `auto:sms_jn_tier` in `crm_account_exclusions`) but **NOT the job links**
  (`jobnumber=NULL` on all 232). Leads are out of COD metrics but not matched to their
  Account jobs / not showing true outcome. **Resolution is DECIDED** (spec §5.1, 3 constraints:
  unique caller phone only / 30-day forward window / flag is_account+exclude). Remaining =
  write the links by rule. **Highest-$ item: 977 leads / $6.1M.**
- **"Build A" (this session, UNCOMMITTED):** changes to `build_lead_timeline.sql` +
  `t7-classifier.ts` that materialised full content (SMS/OHQ/Outlook/task-email bodies,
  ALL labour lines, ALL task-note authors) into `lead_timeline`, and renamed Missed->
  Unanswered. **Table was rebuilt for verification but NOT committed, NOT deployed, UI
  regression NOT checked.** Critical nuance: the **CC-as-classifier** path (free, used for
  validation) reads these new materialised columns; the **production `classify.ts`** path
  does NOT — it still hydrates at runtime with `LIMIT 1`/`LIMIT 5` (first-touch-only).
  See "two channels" below.

### NOT BUILT
- **§2.6 Correspondence coverage hole (3 leaks, one fix) — NEW this session, see spec §2.6:**
  we harvest the `jobs@` mailbox SHADOW, not the authoritative sources. Missing:
  (1) outbound SMS with no reply (MessageMedia only emails on reply) — needs MessageMedia
  reporting API; (2) staff emails sent from non-`jobs@` mailboxes; (3) **AroFlo's own
  email/SMS task entries baked into the job** — UNTESTED whether `join=notes`/another
  endpoint exposes them (CC said "can't call the API" — it CAN; Postman + creds exist).
  Breaks §4.3 Customer-Unresponsive evidence; under-ingests outcome-altering content.
- **§5 JN-from-email-body tier** — "Handled JN#XXXXXX" in email/note bodies ->
  deterministic link. 316/507 task emails carry an extractable JN. Specced (§5 family),
  not built. (NOTE: this was dropped from an earlier spec rev — confirm it's now captured.)
- **T7 production wiring** — proposal queue (`action='proposed'`), confirm/reject UI,
  scheduler, residual feed. T7 is PROPOSE-only, never auto-link.
- **T1–T3 deterministic tiers ARE live** (spec §5). T4 retired (0 matches). T5/T6
  proposal-only, likely superseded by T7.

### SETTLED FACTS (don't re-investigate)
- `join=tasknotes` ingest WORKS (107,378 notes / 23,876 jobs). The earlier "probe returned
  empty" was a malformed enumeration probe, NOT a broken ingest. Open piece is ONLY whether
  a different join exposes AroFlo email-type entries (part of §2.6 #3).
- SMS reaches us as MessageMedia REPLY-notification emails into `raw_emails_received`
  (`from_email LIKE %message-media%`). AroFlo task emails = `raw_emails_sent` to the AroFlo
  task address. Both are subsets of the existing `jobs@` Outlook ingest — NOT new API pulls.

---

## WHAT T7 IS (so it's never re-derived)
T7 does **BOTH** from one content read: (1) **MATCH** — proposes which job an opp links to;
(2) **CLASSIFY** — proposes funnel sub-status (spec §4 taxonomy). PROPOSE-only, human/audit
above it. It is the **bottom rung** of the §5 cascade — runs on the RESIDUE the deterministic
tiers can't link. Validated 65/65 blind on the OLD narrow input — **that validation is
INVALID once input changes** (Build A changes it).

### Two channels (the cost model — not two systems)
- **CC-as-classifier** = free (Ric's Claude Code plan). Used NOW for dev + blind validation.
  Reads the materialised `lead_timeline` columns (incl. Build A's full content).
- **Production `classify.ts`** = paid OpenAI calls, scheduled daily. Wired LAST, only once
  the model is proven. Currently still truncates (LIMIT 1/5) at runtime.
- **Rule: validate the EXACT input production will run on.** Before flipping to the paid
  channel, `classify.ts` must read the SAME full input the CC channel validated on, or the
  validation doesn't transfer. **For now: disregard production — prove the model on the free
  channel first.**

### Circularity guard (per output — validation integrity)
When you re-validate, **withhold whatever output is being graded:** for MATCH, withhold the
confirmed JN / `manual_job_number` / `linked_jobs`; for CLASSIFY, withhold the confirmed
sub-status override. Feeding T7 a human-confirmed answer = circular. (Spec §2.5 already HELDs
WC's AI fields for the same reason.) Overrides are applied in the API route, not baked into
the BQ tables `classify.ts` reads — so confirm the input path stays clean.

---

## RECOMMENDED NEXT STEP (Ric to confirm)
The spec is now locked & accurate. The unblocking move is **one read-only verification**, not
a build: **make the live AroFlo API call** (Postman collection at
`/Users/ricgordon/pettr-data/AroFlo API.postman_collection.json`, creds exist) for a
known-correspondence job (e.g. **JN141987**) and report what correspondence AroFlo actually
exposes and via which join/endpoint. That answer decides the build order between §2.6
(correspondence ingest) and §5.1 (Account link tier — highest-$, half-built, deterministic).
Do NOT build before that read-only answer. Do NOT let CC say "can't call the API" without
trying the Postman request.

## Parked (spec §10 has the full list) — do not touch
Dashboard booking-rate denominator (known wrong). Job-view interaction timeline (later, shared
component). vw_accounts repoint. Recording-ingest retry-on-500. Credit-note "other" typing.
Doc number drift (0/20 vs 0/15; §16 figures) — flagged, reconcile later.

## Key paths
- Spec: `~/crm-build/docs/PETTR_CRM_DATA_SPEC.md` (CANONICAL)
- T7: `t7-classifier.ts` / `classify.ts` (production runtime) / CC-as-classifier (validation)
- Timeline build: `bigquery/build_lead_timeline.sql`; UI route
  `src/app/api/leads/[id]/interactions/route.ts`; hydration `…/interaction/route.ts`
- Tables: `lead_timeline`, `lead_gate`, `opportunities`, `crm_account_exclusions`,
  `tasks_complete` (job_status), `tasks_deduped`, `invoices_deduped`, `all_leads_enriched`,
  `raw_emails_received`/`raw_emails_sent`, `raw_calls`/`raw_recordings`/`raw_call_legs`
- Firestore: `crm_lead_overrides`, `crm_match_overrides` (keyed `lead_id`+`job_number`, NEVER
  `opportunity_id` — it changes on rebuild)
- BQ: `pttr-taskdata`, `ds_crm`/`ds_aroflo`/`gd_WhatConverts`, `--location=US`
- Orchestrator good revision: 00025-qam. Deploy via `deploy.sh` (committing SQL ≠ deployed).
- AroFlo Postman: `/Users/ricgordon/pettr-data/AroFlo API.postman_collection.json`

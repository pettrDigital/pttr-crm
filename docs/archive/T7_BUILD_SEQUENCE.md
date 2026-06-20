# T7 — Build Sequence & Locked Decisions

**Purpose:** the single map for the T7 match+classify build. Replaces the long
chat thread. Read this + `t7_taxonomy_spec.md` + `data_coverage_audit.md`.
**Standing standards apply** (distrust CC "validated" claims unless genuinely
blind; revenue = `vw_job_invoiced`; never edit BQ views; Sydney time;
`~/crm-build` is source of truth).

---

## The core principle (everything follows from this)

T7 may read **raw evidence only** — what the customer said/typed, call
recordings/transcripts, AroFlo job facts, invoices, objective identity signals
(phone, email, name, address, date, job description).

T7 may **never read any human work-product** created while reviewing a lead —
not WC human classifications, not `form_job_number`, not `manual_job_number` /
`linked_jobs`, not human notes-about-classification. Using a human's answer to
reproduce the answer is circular and defeats the purpose.

Those human fields are the **held-out comparison basis** — scored against
T7's output, never fed in.

---

## The architecture (3 steps on a materialised foundation)

```
0. lead_timeline (materialised table, the master query)  ← content foundation
1. Deterministic match        (graph: phone/email/30-day) — links the bulk
2. T7 residual match          (content signals) — ONLY opps the graph left unlinked
3. T7 classification           (ALL leads) — gate fixes stage from facts, T7 picks sub-status
```

Match fully settles (1 then 2) before classification (3) runs. Match and
classify both read the same materialised timeline row — content assembled once,
no re-read. Two model calls only on residual opps; one (classify) on the rest.

---

## Locked decisions

### Data layer
- **One master query → materialised `lead_timeline` table**, built by a new
  `build_lead_timeline.sql`, orchestrated like `build_opportunities.sql`. NOT a
  view edit. Summary/metadata per touch; full 13k-char bodies fetch-on-demand.
- **PROVENANCE — do not re-derive.** `build_lead_timeline.sql` is a faithful
  PORT of the already-verified assembly logic in
  `src/app/api/leads/[id]/interactions/route.ts` (the three Outlook paths A/B/C,
  the Path C distinctiveness guard + generic-subject stop-list, the
  double-render sender-exclusion list, the known-email-set construction —
  built and verified 2026-06-13). The materialisation changes WHERE the logic
  runs (set-based SQL vs per-request), never WHAT it is. Any future change to
  timeline assembly happens in ONE place and propagates; never let a consumer
  re-implement it from scratch (doing so dropped the Path C guard once and
  produced 59k rows of thread-noise).
- Both the classifier and the UI read this table (fixes the slow lead-open too).
- Kills the ~6-queries-per-opp round-trip pattern (the 45-min harness / slow UI).

### Form content (assembly bug — zero leads genuinely content-less)
- `classify.ts:106` excludes Form Submissions from enrichment. Fix two paths:
  - WC-tracked (90%): read + parse `all_leads_enriched.additional_fields_json`
    (varying WPForms key names) → full_content.
  - Email-only (10%, Quinn LP + WPForms): drop the exclusion so form touches
    match `raw_emails_received` by interaction_id.
  - Test artifacts / employment inquiries → stay Unable to Classify.
- Must be a first-class source in `lead_timeline`.

### Stage gate — every stage boundary is a fact-fence (code, pre-T7)
- **Not Captured** (determined): Unanswered (no answered call), Dropped
  (answered <20s AND no content — content overrides duration), Technical Error
  (form/ingest-gap fact). Removed from T7's allowed outputs.
- **Unable to Classify** (determined): touch exists, genuinely zero content.
  Own bucket, `exclude_from_analysis=TRUE`, OUTSIDE quotable denominator,
  separate from Not Quotable. T7 `abstained` collapses here.
- **Booked** (fence: JN exists → Booked, hard):
  - Determined: `Completed and Invoiced` ⟺ `invoiced_total_ex > 0` (status
    string irrelevant).
  - T7 judgement (JN, $0 invoiced): Completed-Invoice Pending, Quote Only,
    Booking Cancelled (any reason incl. went-elsewhere-WITH-JN), Unable to
    Complete-Out of Scope, Job Pending.
  - **Rule from blind run:** Archived + $0 + no completion note → lean
    didn't-proceed (Quote Only / Booking Cancelled), NOT Job Pending.
  - `ungated_open` (JN, Open status) → constrained Booked prompt, not full.
  - Account-billing edge: Archived + $0 + Account terms → `account_billing_review`,
    not auto-complete, surface for review.
- **Not Quotable** (all judgement, fence: no JN): Spam, Service Not Provided,
  Outside Service Area, Strata Issue, Customer Inquiry Only, Wrong Number,
  Not Job Related.
  - DELETE the "cleaning/employment/office-space = Not Job Related" rule — those
    are Spam.
  - Not Job Related = a known staff member is a party to a call about other
    existing business (needs `is_internal` surfaced — BUILD PREREQUISITE).
  - **Outside Australia = Spam** (determinable from location; confirm geo signal).
- **Not Booked** (all judgement, fence: JN exists → NOT eligible, must be Booked):
  Customer Unresponsive, Tenant/Strata Referral, Price/Min Call Out,
  Capacity/Scheduling, Wanted Quote Over Phone, Customer Resolved,
  Booked Elsewhere (no-JN only), PETTR Did Not Respond (keep, unscored),
  Other (catch-all, MUST surface for review when used).
  - ENTIRE stage currently has ZERO prompt definitions — all need writing
    (drafted in `t7_taxonomy_spec.md`).

### Input / comparison boundary
- **Input (raw evidence):** additional_fields_json, caller_name/contact identity,
  ring_duration, invoice `lines`, transcripts, notes, AroFlo facts.
- **Excluded from input (human work-product):** WC judgement fields
  (quotable/lead_class/is_booking/form_reason_did_not_convert), form_job_number,
  manual_job_number, linked_jobs.
- **Comparison basis (held-out):** WC human fields (100% populated, full
  population) AND the RG_006 hand-labelled set (786 → 716 after WC fix).
  - Three-way read: T7+WC agree → confident; disagree → review (either may be
    wrong — proven by Booked-5); WC vs RG_006 disagree → ambiguous, score no one.
  - Requires a WC-taxonomy → our-taxonomy crosswalk before agreement numbers mean
    anything.

### Validation discipline
- **Model usage / OpenAI:** dev + all validation = CC-as-classifier (Claude Code
  reads timelines directly), ZERO API spend — proven to classify ≥ the gpt-4o
  harness. NO OpenAI calls anywhere in build steps 1–6. OpenAI (or another
  programmatic engine) is needed ONLY at step 7 (production T7 classifying ~2,600
  leads on a schedule — can't be pasted into CC). Production engine is TBD and
  Ric's call — NOT necessarily gpt-4o; the existing `ai-classify-validate.ts`
  gpt-4o path stays unused for now, not deleted.
- Always blind: answer withheld from T7 during classification, compared after.
- Score per sub-status (never single aggregate) + abstention/coverage rate.
- Determined facts are fair context but NEVER graded targets.

---

## Prerequisites (must clear before the build proper)

1. **Deploy the Third Stream Amendment** — ✅ DONE (2026-06-14). Deployed +
   §10 validation passed (+26 net, explained; 0 double-counts; 21 dropped leads
   recovered, 1 correctly absorbed as a secondary array touch on J-141679).
   Cloud Function redeployed (rev 00020) so scheduled nightly rebuilds carry the
   amendment. GT set reconciles toward 716.
2. **Spec corrections landed** — confirm CC applied the 4 fixes to
   `t7_taxonomy_spec.md` (decision-tree ordering, CU count, 187→183 explanation,
   is_internal prerequisite) + the new rulings here (Archived+$0 rule, outside-AU
   = Spam, CSR Failure → mapping, form content as first-class source).
3. **CSR Failure GT mapping** — confirm it maps to its intended bucket (our
   failure), NOT silently folded into Customer Unresponsive.

---

## Build order (validate free via CC-as-classifier at each gate)

1. **lead_timeline master query** → materialised table — ✅ DONE (2026-06-14,
   commit 9e7b768). Faithful port of `interactions/route.ts`, per-opp confirmed
   identical, form content recovered, outlook_C noise fixed, 4 seeded opps
   recovered. Table built and live; NO consumers repointed yet.
2. **Repoint consumers to lead_timeline.** UI FIRST (eyeball-verifiable — open
   leads, confirm timeline renders from the table and matches expectation), THEN
   the classifier. This makes the table the single source of truth so UI = what
   T7 sees. Do NOT skip the UI eyeball check before the classifier depends on it.
   Drop the orphan `lead_interactions` / `vw_lead_email_timeline` /
   `vw_contact_timeline` only after repoint confirms nothing else needs them.
3. **Deterministic match** confirmed/unchanged (already runs via the graph —
   verify it feeds the table correctly, not a rebuild).
4. **Gate logic** (code): stage determination from facts, per spec. Validate:
   fence violations = 0 (no JN-bearing lead leaves Booked; no determined-complete
   sent to T7).
5. **T7 residual matcher** (content signals, objective only). Validate blind on
   the unlinked residual.
6. **T7 classifier** constrained by gate, all definitions written. Validate blind
   per sub-status vs RG_006 AND WC comparison (crosswalked).
7. **Full blind re-run** once clean; read per-class + the disagreement buckets.
8. **Production engine + deployment plumbing** (propose-only, queue,
   confirm/reject UI). After validation passes. Prerequisite: sync the UI
   classification taxonomy to the new spec (it's on the old one — see UI impact).

---

## UI impact (mapped 2026-06-14)

- **Recovered leads (B.1):** ✅ no action — UI reads `vw_lead_enriched` over the
  opportunities table; the 21 recovered WC leads fall in the date window and
  appear automatically.
- **Form content (B.2):** the UI lead-detail (`interaction/route.ts`) and the
  classifier BOTH miss `additional_fields_json` — same gap, same fix. Building
  the form-content read once in `lead_timeline` (step 1) fixes BOTH; do not patch
  two code paths. (Email-parsed forms already render in the UI; only WC-tracked
  WPForms-JSON forms are blank.)
- **Taxonomy sync (B.3) — STEP-7 PREREQUISITE (before T7 goes live, not before
  the build):** the UI manual-classification dropdown (`lead-classification.tsx`)
  is on the OLD taxonomy. If staff classify today they pick a stale list T7 will
  disagree with. Divergences to fix:
  - Unable to Classify: UI has it under Not Captured; spec = its own stage.
  - Completed and Invoiced / Completed - Invoice Pending: missing from UI (still
    shows old `Job Complete`).
  - Technical Error: UI under Not Quotable; spec = Not Captured.
  - Booked Elsewhere: UI under Not Booked with no JN guard; spec = no-JN only.
  - CSR Failure: confirm target bucket (our-failure → likely PETTR Did Not
    Respond), NOT defaulted into Customer Unresponsive. **Still unresolved —
    settle during taxonomy sync, don't let the default stand by inertia.**

---

## Coverage-gaps backlog (recorded, NOT today)

- Email-only form latency: form-notification emails can arrive weeks late
  (Sajan Parajuli +5wk) — time-windowed matching may miss them.
- Vodafone Orphan: parked label, 0 GT, likely after-hours artifact — define or drop later.
- `is_internal` flag not surfaced to touches (gates Not Job Related).
- `happy_call_grade`/`happy_call_details` (AroFlo CSAT) — unused, possible future signal.
- `invoices_deduped.lines` — per-service revenue breakdown, only the sum consumed.
- `first_response_minutes` is NULL — computable from `ring_duration`.
- 8x8 recording-ingest retry hardening (watermark advances on transient 500s).
- Dashboard booking-rate denominator — parked until classification fills buckets.
- The matcher (step 2) as a full project incl. its own blind validation set.
- UI detail-click view for WPForms forms doesn't parse `additional_fields_json` —
  shows name/phone only; full form problem text not reachable from detail view
  (timeline list summary shows it, truncated ≤300 chars). Minor UI polish, not
  a blocker.
- Path B short-JN substring match: JNs with ≤4 digits (e.g. "59", "33") match
  unrelated email subjects via LIKE '%59%'. Pre-existing in the per-opp route;
  5 cross-opp contamination cases in lead_timeline. Fix: require JN ≥5 digits
  or word-boundary match. Not introduced by materialisation.

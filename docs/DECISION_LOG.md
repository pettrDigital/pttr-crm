# Decision Log

Append-only. Each entry: date, type (DECISION / DONE / DEFERRED), one-line
"what", brief "why", pointer to the authoritative location (spec section,
commit, file). State lives in the spec; this log records how it got there.

---

## 2026-06-20 — L1a: Taxonomy locked

- DECISION: Single source of truth for the classification taxonomy is
  `src/lib/classifier/taxonomy.ts`. All consumers import from it; no consumer
  redefines leaves, stages, allowed-sets, or definitions. S4.4 is
  generated from this file by `scripts/render-taxonomy-md.ts`.
  → spec S4.4

- DECISION: Label definitions live in taxonomy.ts (Option B). T7 leaf
  definitions are LIFTED VERBATIM from the validated NQ_NB_SYSTEM_PROMPT /
  BOOKED_SYSTEM_PROMPT; gate/manual leaves use the §3.5(b) text. Reasoning
  heuristics stay in the prompt.
  → src/lib/classifier/taxonomy.ts

- DECISION: Strata Issue kept as a SEPARATE leaf from Tenant / Strata
  Referral. Distinct outcomes: Strata Issue = Not Quotable (matter is the
  owners-corporation's responsibility, we cannot service it); Tenant /
  Strata Referral = Not Booked (we can do the work, caller lacks authority).
  Surfaced by CC's §3.5 merge-safety flag.
  → spec S4.4

- DECISION: "Strata Issue" renamed to "Common Property Responsibility" to
  remove the name collision with Tenant / Strata Referral. Definition and
  stage unchanged.
  → spec S4.4; LEGACY_MAP in taxonomy.ts

- DECISION: "Wrong Number / Contact Details" renamed to "Wrong Number"
  (matches the GT-scored concept; suffix was scope-creep).
  → spec S4.4; LEGACY_MAP in taxonomy.ts

- DECISION: "Vodafone Orphan" retired as a leaf; folded into No Follow-Up
  Recorded. Determinable artifact, never a content judgement.
  → spec S4.4; LEGACY_MAP in taxonomy.ts

- DECISION: "Technical Error" removed. Form/ingest outages leave no lead to
  classify; backfilled leads classify normally.
  → spec S4.4

- DECISION: "Job Complete" removed. Resolves to Completed and Invoiced via
  the gate.
  → spec S4.4; LEGACY_MAP in taxonomy.ts

- DECISION: "PETTR Did Not Respond" removed from the UI; replaced by No
  Follow-Up Recorded. Honours the earlier dropped-PDNR decision that the UI
  hadn't caught up to.
  → spec S4.4; LEGACY_MAP in taxonomy.ts

- DECISION: "Account Billing Review" added (Booked). Account/strata job
  archived at $0 — billed via the Account arrangement, not COD invoice flow.
  Was emitted by the gate but missing from S4.4.
  → spec S4.4

- DECISION: "Pending Classification" is NOT a taxonomy leaf — it is an
  error/null state. Leads with this label re-run through T7.2.
  → spec S4.4

- DECISION: `action='system_miss'` (orphan flag) is NOT a taxonomy leaf;
  whitelisted so `assertValidLeaf` does not reject it.
  → src/lib/classifier/taxonomy.ts

- DONE: taxonomy.ts built; 7 consumers repointed
  (t7-classifier.ts, lead-classification.tsx, run-cascade.ts,
  status-badge.tsx, getAutoPlacement, src/app/api/leads/route.ts,
  src/app/api/leads/[id]/classify/route.ts). LEGACY_MAP wired via
  `migrateLegacyLeaf`. S4.4 replaced with the generated block.
  resolveGate snake_case bug ('account_billing_review') fixed in passing.
  Grep for removed/renamed strings: zero hits outside LEGACY_MAP.
  → commit <CC: fill in commit hash>

- DONE: Firestore `crm_lead_overrides` distinct-sub_status dump.
  782 total rows: 428 canonical + 24 legacy-mapped + 0 HOLDS + 330
  non-sub_status (undefined / stage-as-sub_status, handled by the read path
  per CC; verification deferred — see L1b checklist). Both HOLDS
  ('Technical Error', 'Pending Classification') are zero in Firestore —
  no backfill required.
  → see L1b PART B item (4)

- DEFERRED: Two pre-existing tsc errors (`t7-dump-input.ts:39`,
  `classify.ts:367`). Not in L1a scope.
  → parked

---

## 2026-06-20 — L1b: T7.2 seam rewired to read from taxonomy.ts

- DONE: NQ_NB_SYSTEM_PROMPT and BOOKED_SYSTEM_PROMPT now generate their
  allowed-output sections from taxonomy.ts via buildNqNbAllowedSection() /
  buildBookedAllowedSection() in src/lib/classifier/prompt-sections.ts.
  All other prompt text unchanged. Byte-diff shows zero differences —
  the generated prompts are identical to the pre-change prompts (the L1a
  renames were already applied to the hand-written text).
  → src/lib/classifier/prompt-sections.ts, src/lib/classifier/t7-classifier.ts

- DONE: Legacy-override verification CLEAN. Write paths: the classify
  POST route is the only active write path; it runs migrateLegacyLeaf()
  before writing, so legacy names are migrated on write. The API does
  not call assertValidLeaf — a raw API call could write a non-leaf — but
  the UI (the only caller) is constrained to canonical leaves via the
  imported taxonomy. FLAGGED as a latent hole for a future task, not
  blocking. Read path: 10 sample Firestore docs (5 undefined, 5 stage-
  as-sub_status) confirmed the read path correctly handles all: account-
  flag docs never surface sub_status; stage-as-sub_status docs pass
  through without leaf-validation and display is driven by BQ facts via
  getAutoPlacement(). No issues found.
  → B.4 evidence in commit message

- DONE: Byte-diff fix — taxonomy.ts Customer Unresponsive definition had
  ASCII `->` where the original prompt used unicode `→`. Fixed to match
  exactly. Post-fix diff: zero differences on both prompts.
  → src/lib/classifier/taxonomy.ts

- DEFERRED: Classify POST route should validate sub_status against
  isValidLeaf after migrateLegacyLeaf. Currently the UI constrains
  inputs, but the API is unguarded. Not blocking L1b — the UI is the
  only caller.
  → src/app/api/leads/[id]/classify/route.ts

---

## 2026-06-20 — L2: Enforcement layer

- DECISION: Cascade runs on EVERY lead, not only the 1,215 reconciliation
  population. Behaviour varies by era via the (scope, mode) matrix:
    historical_pre_dec2025 / deterministic — tiers + gate + orphan only.
      Judgement residual lands as Unable to Classify
      (`auto_rule:pre_dec_deterministic_residual`). Read-only history.
    live_post_dec2025 / full — full cascade incl. T7.1 + T7.2.
    reconciliation_1215 / full + recon readout — full cascade + 1,215 footing.
  Boundary: opportunity_timestamp_sydney < '2025-12-01T00:00:00'
  (= first-touch time per ct.min_ts in build_opportunities.sql).
  `first_touch_at` does not exist as a column; using
  `opportunity_timestamp_sydney` directly per Ric's direction.
  → src/lib/cascade/run-config.ts

- DONE: Scope+Mode lock with invalid-combo rejection. 3 valid combos
  accepted; 4 invalid combos rejected with descriptive messages.
  10 tests pass. Population-count halt for reconciliation_1215 (must = 1215).
  → src/lib/cascade/run-config.ts, run-config.test.ts

- DONE: 3-way join consolidated to wc-mapping.ts. Primary → array →
  phone priority. Structured trail (primary_hits, array_hits, phone_hits,
  unmapped, total). Array-fallback test passes; deliberate primary-only
  patch fails the test; reverted.
  → src/lib/cascade/wc-mapping.ts, wc-mapping.test.ts

- DONE: Orphan detection as STEP 6.5. selectClosestCandidate uses
  ABS(date_diff) ASC — date proximity, NOT invoice amount. Deliberate
  sort-by-invoiced_ex patch fails 3 tests; reverted.
  → src/lib/cascade/orphan-detect.ts, orphan-detect.test.ts

- DONE: assertValidLeaf / isValidLeaf wired at every sub_status write
  site: classify POST route (returns 400 + valid leaf list), firestore.ts
  setClassification (throws), run-cascade.ts step 8 staging write (HALT
  on off-taxonomy T7.2 output). system_miss whitelisted. L1b latent gap
  closed.
  → classify/route.ts, firestore.ts, run-cascade.ts

- DONE: Keyword-shortcut check script (check-no-keyword-classifier.ts).
  Greps for t7_classify_signals and CASE WHEN producing leaf strings.
  Exits non-zero on violation. Wired as `npm run check`. Zero hits today.
  Deliberate throwaway .sql file triggered violation; reverted.
  → scripts/check-no-keyword-classifier.ts, package.json

- DONE: Footing-halt as STEP 9.5. Manifest for reconciliation_1215
  (109 + 1095 + 8 + 3 = 1215, tolerance=0). Other scopes log
  informational counts only. Deliberate 1-bucket diff HALTs before
  readout. 7 tests pass.
  → src/lib/cascade/footing/check.ts, footing/reconciliation_1215.ts

- DONE: Vitest installed (v2.x for Node 20 compat). vitest.config.ts,
  `npm test` script. 28 tests across 4 files, all passing.
  → vitest.config.ts, package.json

- DONE: Step 7 anti-shortcut comment block added to run-cascade.ts.
  → scripts/run-cascade.ts

- DEFERRED: §3 sanity check against the 6 known June 20 orphans
  (dry-run Step 6.5 against reconciliation_1215). Requires a live BQ
  query against the full population — cannot be run code-only without
  a cascade invocation. The selectClosestCandidate logic is tested;
  the full-population scan requires the cascade function.
  → parked for L3 (Cowork-driven run)

---

## 2026-06-20 — L3 pre-gate: Footing manifest updated

- DECISION: Reconciliation_1215 footing manifest updated from
  {109, 1095, 8, 3} to {116, 1088, 8, 3}. Total unchanged at 1215.
  Root cause: test exclusion lists (test_wc_leads, test_numbers, email
  domain rules) were legitimately expanded since the original footing.
  12 leads (7 net new to the exclusion set) investigated individually:
    - 6× alex m (alexm@mrwasher.com.au) — email:mrwasher domain match
    - 2× Fran (francesb@mrwasher.com.au) — email:mrwasher domain match
    - 3× "Removal of CAPTCHA" (matt@quinnmarketing.com.au) — test_wc_leads
      entries with annotated notes ("Quinn marketing test form")
    - 1× Fergus (fergusg@mrwasher.com.au) — email:mrwasher; maps to
      JN143006 (Fergus Gordon, COD Plumbing, Open, $0) — internal test job
    - 2× alex m (+61424442579) — test_numbers entry (note: "Ric Gordon")
  All genuine internal identities. Zero converters. Zero revenue impact.
  The one "Booked" lead (Fergus, JN143006) is the classifier author
  testing with his own name; Open/$0, not a real conversion.
  → src/lib/cascade/footing/reconciliation_1215.ts

- DECISION: Test exclusion uses ADDRESS-LEVEL rules, not domain-level
  wildcards. 5 explicit addresses: alexm@, fergusg@, francesb@, gordo@
  mrwasher.com.au; matt@quinnmarketing.com.au. Domain-level wildcards
  (@mrwasher.com.au etc.) removed — future staff or agency contacts on
  shared domains must not be silently excluded. Lifetime audit confirmed
  zero risk: all 101 historical leads with these domains used only these
  5 addresses; zero real customer enquiries; zero converters. Content
  audit confirmed zero notification-email leakage into WC fields. Three
  call transcripts mention "mrwasher" in body (receptionist spelling
  the email to customers) — these are real customer leads with no email
  set, unreachable by the exclusion rule. gordo@ has zero leads today
  but is a known test identity per the spec (S15.1).
  Re-footed: address-level produces identical {116, 1088, 8, 3} = 1215.
  → src/lib/cascade/test-exclusion.ts

---

## 2026-06-20 — L3 prep

- DECISION: Internal-email exclusion narrowed from domain-level to
  explicit address list (alexm@, fergusg@, francesb@, gordo@
  mrwasher.com.au; matt@quinnmarketing.com.au). Lifetime + content
  audit showed zero historical risk, but address-level is the
  conservative call against future broadening. Implementation:
  src/lib/cascade/test-exclusion.ts. Manifest re-foots cleanly to
  1,215 with the same 12 leads excluded.

- DECISION: Footing manifest updated from {109, 1095, 8, 3} to
  {116, 1088, 8, 3}. Total unchanged. Shift = 12 newly-excluded WC
  leads mapping to 6 distinct opportunities (5 already excluded
  via is_test_lead on cluster siblings, net +7). Leads named in
  the L3 §1 manifest report. Footing-halt fired and surfaced the
  shift — L2 working as designed.

- DONE: L3 §1 integration gate passed. Orphan dry-run on the
  reconciliation_1215 population found all 6 known orphans with
  correct JNs, foots to $10,993 from vw_job_invoiced. The three
  multi-candidate disambiguations (Aaron $0/12d not $5,412/39d;
  Mark $466/0d not $1,817/81d; John $792/0d not $1,126/15d) all
  selected correctly by date proximity. L2 §3 verified end-to-end
  on real data.

- DONE: L3 §2 scope+mode integration check passed.
  reconciliation_1215/full_recon. Population count = 1,215.
  Three valid combos accepted with correct counts
  (historical=35,624; live=2,838; recon=1,215).
  Three invalid combos rejected with descriptive messages.

---

## 2026-06-20 — L3 prep, late-stage population bug caught

- DECISION: testExclusionWhereClause in test-exclusion.ts had a
  NULL-handling regression — LEFT JOIN to all_leads_enriched
  produces NULL for the 180 CSV leads with no enriched row, and
  NOT (NULL OR ...) evaluates to NULL = falsy, silently excluding
  81 real customer leads from Step 7's classification population.
  Same silent-drop pattern as June 20's 602→548. Caught by the
  L3 §3 population reconciliation Q1, before any classification
  committed. Fix: wrap the exclusion clause in COALESCE(..., FALSE)
  so NULL ALE = not excluded. Patched in test-exclusion.ts; one
  source of truth, one fix.

- DEFERRED (L2 gap, low priority): the L2 footing-halt protects
  the 1,215 manifest population, not the Step 7 judgement-residual
  subset. A bug in the judgement-population query (like this one)
  does not trip footing-halt. Today's fix makes this moot for the
  current run, but worth an entry: a future Step 7 bug could
  silently shift the classification population without firing
  footing-halt. Possible future work: add a judgement-subset
  count check at Step 7 against an expected envelope.

---

## 2026-06-20 — L3 §3: T7.2 classification run complete

- DONE: 538 judgement-residual leads classified by CC-as-classifier.
  Input: docs/t7_classify_ai_input.json (1.6MB, 538 leads).
  Output: docs/t7_classify_ai_output.json (538 classifications).
  Engine: CC reading full timelines against BOOKED_SYSTEM_PROMPT
  (95 leads) and NQ_NB_SYSTEM_PROMPT (443 leads). No keyword
  shortcuts, no API calls — S15.1a AI Seam Integrity honoured.

- DONE: Step 8 batch MERGE to crm_auto_classifications. 538 rows
  written in 11 batches of 50. All passed assertValidLeaf +
  validateT72Rationale + rationale.chosen cross-check pre-flight.
  Schema fix: 5 columns (rationale, jobnumber, run_id, has_outbound,
  has_internal_touch) added via ALTER TABLE — table pre-dated L2.
  SQL fix: explicit STRUCT typing for UNNEST (uniform nullable types),
  explicit INSERT column list (schema order mismatch from ALTER).

- DONE: Step 9 readout generated. 1,460 total leads processed.
  286 resolved via T7.2:judgement, 673 determined:gate, 501 unresolved.
  12 low-confidence leads (< 0.70), all thin-content (empty forms,
  brief calls, communication failures). Full readout at
  docs/cascade_readout.json.

  Classification distribution (538 T7.2 leads):
    Not Quotable (177): Spam 96, SNP 38, WN 22, OSA 13, CIO 5, CPR 3
    Not Booked (271): NFUR 124, CU 78, BE 14, TSR 13, CR 13,
      P/MCO 10, C/S 8, WQOP 5, Other 1
    Booked (95): QO 81, UCJOS 10, CIP 4
    (5 additional pre-existing rows in BQ from earlier testing)

  4 Completed-Invoice-Pending leads with confirmed EFT/AMEX payments:
    J-142780 Hawanatu $495, J-142947 Hammad $242,
    J-142955 Aqeel $692, J-142975 Michelle $1,045.

---

## 2026-06-20 — L3.5: Engine build attempt

- DECISION: classifyLead in run-cascade.ts is intentionally a throw.
  CC reasoning (the validated 89.1% engine) is not callable from inside
  a tsx script — the model is the engine, and the engine runs at the
  AI seam between two cascade invocations, not as a function call.
  classifyLead defines the contract accurately (prompt selection,
  allowed-set derivation with pre-pass constraints, prompt assembly,
  validation steps) but cannot invoke the engine because the engine
  is the conversation participant, not an API endpoint.
  → scripts/run-cascade.ts classifyLead function

- DONE: validateVerdict function built and wired into Step 8. Validates
  every CC-produced verdict against the classifyLead contract: shape
  (validateT72Rationale), leaf (assertValidLeaf), chosen === sub_status
  cross-check, and chosen-in-allowed-set (pre-pass constrained). 538/538
  verdicts pass. This is the same validation classifyLead step 5 specifies.
  → scripts/run-cascade.ts validateVerdict, step8_writeClassifications

- DECISION: The cascade runs end-to-end via two invocations:
  (1) `--step=7` materialises input, prints "AI SEAM", exits (line 1023).
  (2) CC classifies in conversation, writes output file.
  (3) `--step=8` reads output, validates via validateVerdict, batch MERGEs.
  This is a two-invocation model with a human-in-the-loop gap at Step 7.
  The gap is structural, not a TODO — the classification engine (CC) runs
  as a conversation participant, not as a callable API.
  → scripts/run-cascade.ts main(), lines 1018-1024

- DONE: Step 8 SQL fixes for BQ compatibility:
  (a) Chunked MERGE into batches of 50 (BQ query size limit).
  (b) Explicit STRUCT<...> typing in UNNEST arrays (uniform nullable types —
      CAST(NULL AS STRING) instead of bare NULL to avoid supertype errors).
  (c) Explicit INSERT column list instead of INSERT ROW (column order
      mismatch after ALTER TABLE added 5 columns at end of existing table).
  → scripts/run-cascade.ts step8_writeClassifications

- DECISION: Cowork wired as the autonomous trigger for the two-invocation
  cascade. Project "PETTR CRM Lead Classification" set up in Claude Cowork
  pointing at ~/crm-build. Cowork reads CLAUDE.md, the spec, the decision
  log, and the cascade code; first read-only task passed (accurate
  project summary, correct articulation of S15.1a in own words). Cowork
  drives the seam: triggers --step=7, classifies via its own Claude
  reasoning per the validated prompts at the seam, triggers --step=8.
  Same model class as CC, autonomous execution. The L3.5 "engine call
  is open" problem is closed at the architecture layer — the engine is
  the model at the seam, the trigger is Cowork, no headless CC or paid
  API needed for the current scale.
  → Claude Cowork project setup

---

## 2026-06-20 — L3.6: Step 7/8 file-handoff retired

- DECISION: Step 7 no longer writes docs/t7_classify_ai_input.json.
  The judgement-residual population is materialised to
  ds_crm.t7_classify_input (BigQuery table) instead. Classification
  happens by querying sub-batches from that table directly.
  → scripts/run-cascade.ts step7_classify
  → ds_crm.t7_classify_input DDL

- DECISION: Step 8 no longer reads docs/t7_classify_ai_output.json.
  Classifications are written to ds_crm.t7_classify_staging by
  the classifier per sub-batch. Step 8 reads staging for the
  current run_id, validates via validateVerdict, batch-MERGEs to
  crm_auto_classifications, deletes staging rows for that run_id.
  → scripts/run-cascade.ts step8_writeClassifications
  → ds_crm.t7_classify_staging DDL

- DECISION: The classification flow is now BQ-query-driven, not
  file-driven. Documented in CLAUDE.md. This matches the June 20
  morning-run mechanics and removes the chunked-file-Read overhead
  that made today's L3 §3 take all day.

- DONE: Dry-run test passed. 5 synthetic leads, 4 valid + 1
  invalid in staging. Step 8 halted on the invalid, nothing
  written to crm_auto_classifications. Fixed the invalid,
  re-ran, all 5 landed. Staging truncated correctly.

- UNAFFECTED: Today's L3 §3 run_id and its 538 classifications
  remain in crm_auto_classifications untouched (549 total rows
  confirmed after test cleanup).

---

## 2026-06-20 — L3.7: MERGE-key bug fixed for run coexistence

- DECISION: Step 8's MERGE ON clause changed from `T.opportunity_id = S.opportunity_id` to
  `T.opportunity_id = S.opportunity_id AND COALESCE(T.run_id, '') = COALESCE(S.run_id, '')`.
  Previously, multi-run on the same population overwrote prior rows — coexistence was
  impossible. This silently overwrote L3 §3 data when tonight's cc_recon run landed.
  Surfaced by Cowork's pre-run audit. COALESCE handles existing NULL run_id rows safely
  without a schema migration.
  → scripts/run-cascade.ts step8_writeClassifications

- DONE: Dry-run verified — two runs with same opp_ids but different run_ids now coexist as
  distinct rows. Re-running with same run_id is idempotent.
  → commit 81ba295 (labour-note check), this commit (MERGE key fix)

---

## 2026-06-21 — L3.8: launchd watcher + control table for autonomous Step 8 trigger

- DECISION: Built ds_crm.t7_run_control + scripts/cowork-step8-runner.sh +
  com.pettr.cowork-step8-runner launchd agent. Cowork writes 'ready' rows after
  classification; the launchd agent polls every 60s and runs the actual tsx Step 8
  command on the host. Wrapper is single-purpose: read run_id, run Step 8, write
  outcome back to the control row. Verbatim stderr preserved in .error file.
  → S15.1a preserved: Step 8 still runs on the Mac, under Ric's credentials,
    executing the actual validateVerdict and MERGE.
  → Cowork instructions need updating: Step 8 trigger is now via control table
    INSERT, not via "Ric runs it manually". Update Cowork project instructions
    after this verification lands.
  → commit ab23ffa

- DONE: Dry-run verified (5 leads, end-to-end success). Failure path verified
  (validateVerdict halt captured verbatim, no MERGE on failure). Atomicity
  verified (mixed batch: 4 valid NQ/NB + 1 invalid Booked; 0 rows merged,
  bad row halts entire batch before any MERGE). Staging-delete confirmed
  effective (0 rows remaining after successful Step 8). launchd trigger
  confirmed via created_at→started_at gap (55s, consistent with 60s poll).
  Re-verified 2026-06-21.

- NOTE: The staging-delete log line in run-cascade.ts:882 prints
  unconditionally after the DELETE job completes, without checking
  affected-row count. Not a bug today (DELETE works), but a latent
  false-positive if streaming-buffer rows are ever involved.

---

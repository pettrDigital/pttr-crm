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

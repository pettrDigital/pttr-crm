# PETTR CRM — Session Handoff (status snapshot)

**Read `PETTR_CRM_DATA_SPEC.md` for ALL requirements.** This doc is status only —
what's built, what's pending, what's next. No requirements live here.

---

## WHERE THINGS STAND (updated 2026-06-20, end of L3 session)

### L1a — TAXONOMY LOCKED

- `src/lib/classifier/taxonomy.ts` is the single source of truth for the
  classification taxonomy (27 leaves). All 7 consumers repointed to import
  from it: t7-classifier.ts, lead-classification.tsx, run-cascade.ts,
  status-badge.tsx, getAutoPlacement, leads/route.ts, classify/route.ts.
- Derived exports: SUB_STATUS_TO_STAGE, BOOKED_ALLOWED, NQ_NB_ALLOWED,
  ALL_LEAVES, assertValidLeaf, migrateLegacyLeaf + LEGACY_MAP.
- 5 renames/removals applied (Strata Issue → Common Property Responsibility,
  Wrong Number / Contact Details → Wrong Number, Vodafone Orphan → NFUR,
  Technical Error removed, Job Complete removed, PETTR Did Not Respond → NFUR).
  Account Billing Review added (was emitted by gate but missing from S4.4).
- S4.4 in the spec is generated from taxonomy.ts by scripts/render-taxonomy-md.ts.
- Committed.

### L1b — T7.2 SEAM REWIRED

- NQ_NB_SYSTEM_PROMPT and BOOKED_SYSTEM_PROMPT now generate their allowed-output
  sections from taxonomy.ts via buildNqNbAllowedSection() / buildBookedAllowedSection()
  in src/lib/classifier/prompt-sections.ts.
- Byte-diff verified: generated prompts are identical to the pre-change hand-written
  prompts. One `→` vs `->` arrow difference caught and fixed.
- Legacy-override verification clean (write paths: classify POST runs
  migrateLegacyLeaf; read paths: 10 Firestore samples verified).
- DEFERRED: classify POST route should validate sub_status against isValidLeaf
  after migrateLegacyLeaf (UI constrains inputs but API is unguarded).

### L2 — ENFORCEMENT LAYER

All 6 sub-tasks built and tested (41 tests, all passing):

1. **Scope+Mode lock** (run-config.ts): 3 valid combos accepted, 4 invalid
   rejected. Population-count halt for reconciliation_1215 (must = 1215).
2. **3-way CSV→opp join** (wc-mapping.ts): primary wc_lead_id → array
   membership → phone E.164 fallback. reconMappedOppsCTE() generates the SQL
   CTE used by Step 7 and Step 8.
3. **Orphan detection** (orphan-detect.ts): selectClosestCandidate uses
   ABS(date_diff) ASC — date proximity, NOT invoice amount.
4. **Footing halt** (footing/check.ts + reconciliation_1215.ts): manifest
   {116, 1088, 8, 3} = 1215, tolerance=0. Other scopes informational only.
5. **Validator at every write site**: assertValidLeaf wired at classify POST
   (400 + valid leaf list), firestore.ts setClassification (throws),
   run-cascade.ts Step 8 (HALT on off-taxonomy output). system_miss whitelisted.
6. **No-keyword-shortcut check** (check-no-keyword-classifier.ts): repo-wide
   scan for keyword classifier patterns. Wired as `npm run check`.
- Vitest installed (v2.x, Node 20 compat). `npm test` runs 41 tests.

### L3 PREP — POPULATION FIXES

- **COALESCE fix**: testExclusionWhereClause had NULL-handling regression — LEFT
  JOIN to ALE produces NULL for 180 CSV leads with no enriched row, silently
  dropping 81 real customer leads. Fixed with COALESCE(..., FALSE). Caught by
  population reconciliation Q1 before any classification committed.
- **Manifest updated** from {109, 1095, 8, 3} to {116, 1088, 8, 3}. All 12
  newly-excluded leads investigated individually (6× alexm@, 2× francesb@,
  3× matt@quinnmarketing, 1× fergusg@, 2× +61424442579). All genuine internal.
- **Address-level exclusion** locked: 5 explicit email addresses, not domain
  wildcards. Lifetime audit confirmed zero customer leakage across 101 historical
  leads. Content audit confirmed zero notification-email leakage into WC fields.
  → src/lib/cascade/test-exclusion.ts

### L3 §1 — ORPHAN DRY-RUN (PASSED)

All 6 known orphans fired with correct JNs, footing to $10,993 from
vw_job_invoiced. Three multi-candidate disambiguations verified by date
proximity: Aaron $0/12d not $5,412/39d; Mark $466/0d not $1,817/81d;
John $792/0d not $1,126/15d.

### L3 §2 — SCOPE+MODE INTEGRATION (PASSED)

reconciliation_1215/full_recon. Population = 1,215. Three valid combos
accepted with correct counts (historical=35,624; live=2,838; recon=1,215).
Three invalid combos rejected.

### L3 §3 — CLASSIFICATION RUN (COMPLETE)

- 538 judgement-residual leads classified by CC-as-classifier reading full
  timelines. Engine: Claude reading NQ_NB_SYSTEM_PROMPT (443 leads) and
  BOOKED_SYSTEM_PROMPT (95 leads) via the file-handoff seam in
  scripts/run-cascade.ts Step 7. No keyword shortcuts, no API calls.
- Input: docs/t7_classify_ai_input.json (1.6MB, 538 leads with job-side
  content folded into timelines as labelled sections).
- Output: docs/t7_classify_ai_output.json (538 classifications, all passing
  assertValidLeaf + validateT72Rationale + rationale.chosen cross-check).
- Step 8 batch MERGE to crm_auto_classifications: 538 rows in 11 batches.
  Schema fix (5 columns added via ALTER TABLE). SQL fix (explicit STRUCT
  typing + explicit INSERT column list).
- Step 9 readout: docs/cascade_readout.json.
- Final distribution in DECISION_LOG.md under "L3 §3".

### L3.5 — ENGINE BUILD + COWORK TRIGGER

- `classifyLead` function written in run-cascade.ts — throws intentionally.
  CC reasoning is not callable from inside a tsx script. The engine IS the
  model at the seam, not the function. classifyLead defines the contract
  (prompt selection, allowed-set derivation, validation) accurately.
- `validateVerdict` function written and wired into Step 8 — validates each
  verdict against the classifyLead contract (shape + leaf + cross-check +
  allowed-set membership).
- **Cowork wired as the autonomous trigger.** Project "PETTR CRM Lead
  Classification" set up in Claude Cowork pointing at ~/crm-build. Cowork
  drives the seam: triggers --step=7, classifies via its own Claude reasoning
  per the validated prompts, triggers --step=8. Same model class as CC,
  autonomous execution. First read-only task passed (accurate project summary,
  correct articulation of S15.1a in own words).
- The L3.5 "engine call is open" problem is closed at the architecture layer:
  the engine is the model at the seam, the trigger is Cowork, no headless CC
  or paid API needed for the current scale.

### HOW THE CASCADE RUNS TODAY

1. `npx tsx scripts/run-cascade.ts` — runs Steps 0-7, materialises
   `docs/t7_classify_ai_input.json`, prints "AI SEAM", exits.
2. CC (Claude in conversation) reads the input file, classifies each lead
   against the validated prompts, writes `docs/t7_classify_ai_output.json`.
3. `npx tsx scripts/run-cascade.ts --step=8` — reads output file, validates
   every verdict via validateVerdict, batch MERGEs to BQ, runs readout.

This is a two-invocation model with a human-in-the-loop gap at Step 7.
The gap is structural: the classification engine (CC) runs as a conversation
participant, not as a callable API.

### AUTONOMY GAP (the key finding — conversion-orphan classes)

The system does NOT self-capture conversion-orphans. 6 real-job leads found
by manual scan, NONE by the system. Linker-miss rate: 6/1,095 (0.5%), $10,993.

4 orphan classes (requirements for fixes are in spec S16):
1. **Content-match** (4 leads, $1,258): name/address in Account job description,
   different client phone. Phone-based scans cannot find these.
2. **Clustering-window** (2 leads, $9,735 + 24 full-pop/$42,829): 30-day window
   too tight. Liz Manfredini ($8,855 at 31d), Fong Loretta ($880 at 44d).
3. **Conflation-guard** (live S15.1 violation): frequency heuristic blocked
   Mark Ford despite real $466 job. Must replace with by-list.
4. **Known-staff-caller** (Donna Carey, 2 leads, $0): low priority.

6 orphan INSERTs were REVERTED (flag model: measure miss rate, don't patch).
Orphans are flagged `action='system_miss'` in `crm_auto_classifications`.

### OUTSTANDING — NEXT STEPS (priority order)

1. **Generate docs/t7_wc_reconciliation_final.md** from cascade_readout.json.
   This is the deliverable for Fergus.
2. **Close autonomy gap** — make orphan classes self-capturing (spec S16):
   content-match self-capture, conflation guard by-list, clustering window
   widening.
3. **AroFlo API correspondence-coverage verification** (spec S2.10).
4. **Carried items**: T7.1 backward window, seam JSON §3-compliance, dual-
   classification metric view, payment-regex fix, keyword_rules table,
   vw_lead_enriched fanout, vw_accounts repoint.

### DONE (this session — 2026-06-20)

- L1a: taxonomy.ts locked, 7 consumers repointed
- L1b: T7.2 seam rewired to read from taxonomy.ts, byte-diff clean
- L2: 6 enforcement sub-tasks built (41 tests passing)
- L3 prep: COALESCE fix, manifest update, address-level exclusion locked
- L3 §1: orphan dry-run passed (6 orphans, $10,993, date-proximity verified)
- L3 §2: scope+mode integration passed
- L3 §3: 538 leads classified, written to crm_auto_classifications
- L3.5: classifyLead contract defined, validateVerdict wired, Cowork trigger set up

### DONE (earlier sessions)

- Lead interaction timeline (UI) — 8 sources, per-call resolution
- Recording gap diagnosed — ~25% mobile-forwarded, ~75% capture ceiling
- T7.1 Matcher (13 matches, validated) + T7.2 Classifier (89.1% on 367 GT)
- T7.1→T7.2 wiring deployed (rev 00031/00032, rebuild-proven)
- Revenue model v4 (invoiced/estimated/revenue, note parsers validated)
- is_internal pre-pass (lkp_did_trade → lead_timeline → NJR allowed set)
- Cascade function built + first run (Steps 0-9)
- WC reconciliation population footed (1,215, zero gaps)
- 6 system-missed conversions identified and flagged
- Clustering-window finding sized (24 leads/$42,829 full-pop)
- Orphan detection scan built (content-match + phone-window)
- Doc consolidation: ONE canonical spec (PETTR_CRM_DATA_SPEC.md S0-S18)
- CLAUDE.md slimmed to behavioral rules + pointer
- S15.1a (AI Seam Integrity) added to spec after keyword-shortcut incident

### HALF-BUILT

- §5.1 Account/SMS-resident-phone link tier: exclusion flags written (232 opps)
  but NOT job links. Highest-$ item: 977 leads / $6.1M.
- "Build A" (full content materialised into lead_timeline): table rebuilt but
  NOT committed/deployed. CC-as-classifier reads it; production classify.ts does not.

### NOT BUILT

- §2.6 Correspondence coverage hole (3 leaks — AroFlo API call needed)
- §5 JN-from-email-body tier (316/507 task emails carry extractable JN)
- T7 production wiring (proposal queue, confirm/reject UI, scheduler)

# PETTR CRM — Session Handoff (status snapshot)

**Read `PETTR_CRM_DATA_SPEC.md` for ALL requirements.** This doc is status only —
what's built, what's pending, what's next. No requirements live here.

---

## WHERE THINGS STAND (updated 2026-06-21)

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

### L3.5 — ENGINE BUILD

- `classifyLead` function in run-cascade.ts — calls OpenAI GPT-4.1 via
  `src/lib/ai/openai-client.ts`. API key from GCP Secret Manager (`openai-api-key`).
  Previously threw (CC-mode); replaced with OpenAI API call on 2026-06-21.
- `validateVerdict` function wired into Step 8 — validates each verdict against
  the classifyLead contract (shape + leaf + cross-check + allowed-set + Booked
  labour-note verbatim check).
- Prompt wrappers in `src/lib/ai/prompts.ts`: extend validated system prompts
  with T72Rationale output schema for structured outputs.
- 33 unit tests passing (`src/lib/ai/openai-client.test.ts`): rationale
  validation, taxonomy checks, allowed-set enforcement, prompt assembly,
  JSON schema shape, round-trip validation.

### L3.6 — BQ-TABLE-DRIVEN ARCHITECTURE (commit 2786a36)

- Step 7 materialises `ds_crm.t7_classify_input` (BQ table, not JSON file).
  Classifier queries sub-batches directly from BQ, INSERTs rationale to
  `ds_crm.t7_classify_staging` keyed by run_id. Step 8 reads staging,
  validates, MERGEs to `crm_auto_classifications`, truncates staging.
- cc_recon_2026_06_20_1750 run: 538 leads classified (444 NQ/NB + 94 Booked).
  Agreement with L3 §3: 79.6% overall (76.5% NQ/NB, 93.7% Booked).
  Primary shift patterns: NFUR↔Spam (12), NFUR↔Wrong Number (8),
  Price→NFUR (6), Customer Resolved→NFUR/CU (10).
- **Incident — pattern-then-default on Booked leads**: CC read ~30 of 90
  Booked labour notes, saw "Quote Only" dominate, applied it to remaining 60
  without reading. Two CIP leads misclassified ($934 revenue missed).
  Fixed in 81ba295: validateVerdict now requires 12+ char verbatim substring
  from TECH LABOUR NOTE in Booked rationale.
- **Incident — parallel agents**: Four background agents spawned to classify
  in parallel. Killed before writing to staging. CLAUDE.md updated:
  parallel agents are a substituted engine.

### L3.7 — MERGE-KEY FIX (commit 4bb233d)

- Step 8 MERGE ON clause changed from `opportunity_id` alone to
  `opportunity_id AND COALESCE(run_id, '')`. Multiple runs now coexist
  as distinct rows instead of overwriting each other.
- Bug surfaced when cc_recon run silently overwrote L3 §3 data (538 rows).
  L3 §3 output survives only in `docs/t7_classify_ai_output.json`.
- Dry-run verified: two runs with same opp_ids but different run_ids
  produce coexisting rows. Same run_id re-run is idempotent.

### L3.8 — LAUNCHD WATCHER + CONTROL TABLE (commit ab23ffa)

- `ds_crm.t7_run_control`: Cowork INSERTs status='ready' after classification.
- `scripts/cowork-step8-runner.sh`: launchd agent polls every 60s, runs the
  real Step 8 command on the Mac under Ric's credentials. Verbatim stderr
  captured in `.cowork-step8-logs/`. S15.1a preserved.
- Dry-run verified (5 leads, end-to-end success). Failure path verified
  (validateVerdict HALT captured, 0 merged). Atomicity verified (mixed batch:
  bad row halts entire batch before any MERGE).

### L4 — L2 WIRING + ORPHAN PULLOUT (commit 2ad39c0)

- **L2 modules wired into run-cascade.ts**: --population and --mode flags.
  resolveRunConfig() validates combos before BQ work. StepFlags gate steps.
  Population count + logRunStart after spine build. Step 9.5 footing check
  wired with 4-bucket SQL verified against manifest {116, 1088, 8, 3} = 1215.
  Step 7 conditional scoping (recon CTE vs scopeWhereClause by population).
  Date window auto-set to 'all' for non-live populations.
- **Step 6.5 orphan detection PULLED**: content-match scan produces ~7:1 false
  positives (45 leads vs 6 known). Common first names and strata-resident names
  match unrelated jobs. Adding task-notes/labour-notes made it worse.
  S16.1 requirement stands; automated mechanism deferred. 6 known orphans
  (S16.2, $10,993) handled manually.

### HOW THE CASCADE RUNS TODAY

**Cascade (production classification):**
```
npx tsx scripts/run-cascade.ts --skip-sync [--scope=all]
```
Steps 0-9 run without halting. OpenAI GPT-4.1 classifies inline at Steps 5
(T7.1 match) and 7 (T7.2 classify). ~600 API calls, ~20 min, ~$7/run.
Default scope: 100 days. Use `--scope=all` for full population.
Add `--halt-at-seam` to pause at AI seams for manual classification.
Token usage and timing reported after each phase and at cascade end.
Every row gets a `run_label` with timestamp, population, scope, mode, engine.

**Reconciliation (compare against dashboard — separate script):**
```
npx tsx scripts/run-reconciliation.ts [--csv=data/reconciliation/enriched_leads.csv]
```
Loads dashboard CSV to BQ, maps leads to opps, compares cascade output vs
dashboard classifications, runs footing check, outputs report.

**Mode gating:**
- `deterministic` — no AI steps (5/6/7/8 skipped). Steps 0-4, 9.
- `full` — full pipeline. AI seams run inline (or halt with `--halt-at-seam`).

Multiple runs coexist by `run_id`. Filter a specific run by `run_label`.

### AUTONOMY GAP (conversion-orphan classes — deferred)

6 known orphans (S16.2, $10,993). Automated detection pulled from cascade
(~7:1 false positives). Handled manually. See DECISION_LOG.md L4.

### OUTSTANDING — NEXT STEPS (priority order)

1. **Multi-job gate fix** — 138 opps currently gated Booking Cancelled that have
   a Completed secondary job with revenue ($146K). Set-based gate dry-run validated:
   138/138 flip correctly, 0 false flips, no-op on single-job, no Account opps
   touched. Ship it.
2. **Re-run cascade with prompt v2** — content-first rules, NFUR/CU as last resort.
   Measure NFUR/CU redistribution vs first run. Also picks up spine fixes (internal
   email edge exclusion, Donna test_numbers exclusion).
3. **Apply parked invoice dedup fixes** — `vw_job_invoiced.dedup.sql` and
   `vw_job_revenue.dedup.sql`. $596 on 1 job (JN 140927). Validated, not deployed.
4. **Generate docs/t7_wc_reconciliation_final.md** — the deliverable.
5. **Customer-attribution layer (S19)** — specced, future build.
6. **AroFlo API correspondence-coverage verification** (spec S2.10).
7. **Carried items**: conflation guard by-list, payment-regex fix,
   vw_lead_enriched fanout.

### L5 — OPENAI ENGINE + REPEAT LEADS + PROMPT REFINEMENT (2026-06-21)

**OpenAI GPT-4.1 engine:**
- `src/lib/ai/openai-client.ts`: API client, Secret Manager key retrieval,
  JSON schemas for structured outputs, token usage tracking (`getTokenUsage()`).
- `src/lib/ai/prompts.ts`: prompt wrappers extending validated system prompts
  with T72Rationale output schema.
- `classifyLead()` throw replaced with OpenAI API call.
- `--halt-at-seam` flag: opt-in to preserve old CC-mode halt behavior.
- `runT71MatchInline()`: per-lead T7.1 matching via OpenAI.
- `runT72ClassifyInline()`: per-lead T7.2 classification in batches of 50.

**WC Repeat leads included:**
- `build_opportunities.sql`: `lead_status = 'Unique'` filter removed. Repeat
  leads enter the graph via phone/email. Cascade test exclusion (test_numbers,
  test_wc_leads, internal emails) replaces reliance on WC's is_test_lead alone.
- `vw_leads_unified.sql`: name enrichment join also includes Repeat leads.

**Cascade/reconciliation separated:**
- `scripts/run-reconciliation.ts`: standalone comparison script. Loads CSV from
  `data/reconciliation/enriched_leads.csv` to BQ, compares against existing
  cascade output, runs footing check, outputs report. Does not run the cascade.
- `run-config.ts`: removed `reconciliation_1215` scope, `full_recon` mode,
  `footing` step flag. Cascade is production-only.

**Determined outcomes written (Step 3.5):**
- Gate-determined leads (C&I, BC, JP, Unanswered, Dropped, UTC, ABR) written
  to `crm_auto_classifications` with `action='determined'`, `confidence=1.0`.
  Every lead now has a row — no join to `lead_gate` needed.

**T7.1 rationale persisted:**
- Full `T71Rationale` JSON stored in `rationale` column on `crm_account_exclusions`
  and `crm_t7_match_queue` (candidates considered, signals, reasoning).

**Step 8 bad verdict handling:**
- Bad verdicts flagged with `action='bad_verdict'` and skipped — good verdicts
  written. No more atomic halt on single failure. Bad verdicts preserved in
  `crm_auto_classifications` with error in `reasoning` column for review.

**Classification prompt refinement (based on CC data analysis):**
- **NQ_NB_SYSTEM_PROMPT**: added Substantive Discussion Rule — if PETTR and
  customer had a real conversation, classify by the barrier (Price, Capacity,
  WQoP, etc.), not NFUR or CU. NFUR = no outbound AND no discussion.
  CU = outbound made, customer did not respond. Added Pricing Signals
  override. Refined Wrong Number (explicit misdial only, not garbled calls).
  Rules reference `has_outbound` pre-pass fact directly.
- **BOOKED_SYSTEM_PROMPT**: added Rationale Quality section — must reference
  specific labour note content, not generic boilerplate. Good/bad examples.
- **taxonomy.ts**: definitions updated for NFUR, CU, Wrong Number, Dropped Call
  to match refined prompt guidance. No structural changes (same 27 leaves).

**Output improvements:**
- `wc_leads_json` column: all WC lead IDs associated with each opportunity,
  stored as JSON string on `crm_auto_classifications`. No join to `opportunities`
  needed to see which WC leads belong to each classification.
- `run_label` column: human-readable label on every row — timestamp, population,
  scope, mode, engine. Filter a specific run: `WHERE run_label LIKE '2026-06-21%'`.
- Token usage tracking: prompt/completion/total tokens and estimated cost reported
  after T7.1, T7.2, and cascade complete.

**Prompt v2 (content-first classification):**
- NQ_NB rules restructured: explicit "CLASSIFY BY CONTENT FIRST, NOT BY OUTBOUND
  STATUS" instruction. All content-based rules (SNP, Price, Capacity, WQoP, Tenant,
  etc.) are top-level numbered rules 1-13. NFUR and CU are rules 14-15, labelled
  "LAST RESORT". OHQ calls explicitly identified as substantive interactions.
- SNP rule expanded with specific service types (solar, aircon, appliances, EV
  chargers, data cabling, handyman, white goods).
- Price/MCO rule includes OHQ pricing discussions.

**First OpenAI run completed (2026-06-21):**
- Run label: `2026-06-21T18_37_03_822Z | pop=live_post_dec2025 | scope=all`
- 1,171 leads classified, 4 T7.1 matches, 12 bad verdicts, $11.48 cost, 74 min
- NFUR dropped from 22% (CC) to 11%, CU from 16% to 4%, Price/MCO up 8x
- Reconciliation run against dashboard CSV: 970 opps mapped, 0 spine gap
- Per-lead CSV output: `data/reconciliation/reconciliation_output.csv`

**Forensic reconciliation (Buckets 2-5):**
- Bucket 2 (cascade missed job): 4 dashboard right (backward window), 1 cascade
  right (Customer Inquiry Only), 1 dashboard wrong (phantom job).
- Bucket 3 (cascade has revenue, dashboard doesn't): 4 cascade right (Account
  jobs via site_phone), 1 needs human (name-only match).
- Bucket 4 (JN mismatch): 1 cascade right, 3 dashboard right (Archived primary,
  Completed secondary), 7 both valid (multi-job same customer).
- Bucket 5 (multi-job): 4 confirmed, both jobs belong, same client.

**Invoice dedup finding:**
- `vw_job_invoiced` double-counts JN 140927 ($596 overstated) — same invoicenumber
  under two invoiceids (approved → processed lifecycle). Scope: 1 job, $596.
- `vw_job_revenue` has same bug (independent path, not via vw_job_invoiced).
- Parked fixes: `bigquery/vw_job_invoiced.dedup.sql`, `bigquery/vw_job_revenue.dedup.sql`.
  Validated via CTE, not deployed.

**Multi-job gate analysis:**
- 3,057 multi-job opps (10% of all), $2.47M secondary revenue invisible to cascade.
- 138 opps gated Booking Cancelled with Completed secondary ($146K revenue).
- All COD, all forward-looking, all edge-defined (phone chaining, not hub-spoke).
- Set-based gate dry-run: 138/138 correct flip, 0 false, no-op on single-job.
- Window extension tested (45/60/90d): destructive — 86% of 31-90d jobs already
  attributed to other opps. $1.27M would be stolen. Window stays at 30d.
- Customer-attribution layer specced as S19 (future build, sits above opps).

**Internal email graph edge fix:**
- Test forms (alexm@mrwasher.com.au) created graph edges that clustered with
  internal correspondence (24-75K char opps, 3 bad verdicts).
- Fix: internal emails + test phones excluded from `contact_points` graph edges.
- Centralized: internal email list moved to BQ table `ds_crm.test_emails`.
  All consumers (WC filter, graph edges, testExclusionWhereClause) read from table.
- Donna (+61418400280) added to `test_numbers` (campaign admin, not customer).

**Test/infra:**
- 70 unit tests passing (0 API calls).
- `ferg_csv_classifications` updated to 1,245 rows from `enriched_leads-10.csv`.
- `data/reconciliation/` directory for dashboard CSV exports.
- Dependencies: `openai`, `@google-cloud/secret-manager`.

### DONE (prior sessions — 2026-06-20)

- L1a: taxonomy.ts locked, 7 consumers repointed
- L1b: T7.2 seam rewired to read from taxonomy.ts, byte-diff clean
- L2: 6 enforcement sub-tasks built (41 tests passing)
- L3 prep: COALESCE fix, manifest update, address-level exclusion locked
- L3 §1: orphan dry-run passed (6 orphans, $10,993, date-proximity verified)
- L3 §2: scope+mode integration passed
- L3 §3: 538 leads classified, written to crm_auto_classifications
- L3.5: classifyLead contract defined, validateVerdict wired, Cowork trigger set up
- L3.6: BQ-table-driven cascade (commit 2786a36). cc_recon run: 538 classified,
  79.6% agreement with L3 §3. S15.1a enforcement: labour-note verbatim check
  (81ba295), CLAUDE.md rules (extrapolation, no parallel agents)
- L3.7: MERGE-key fix for run coexistence (4bb233d). Step 8 keys on
  (opportunity_id, run_id) so multiple runs coexist as distinct rows
- L3.8: launchd watcher + t7_run_control table for autonomous Step 8 trigger
  (ab23ffa). Verified: dry-run, failure-path, atomicity, launchd proof.
- L4: L2 enforcement wired into cascade (2ad39c0). --population/--mode flags,
  step gating, footing SQL verified {116,1088,8,3}=1215. Step 6.5 orphan
  detection pulled (~7:1 false positives). Date window auto-widens for non-live.

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

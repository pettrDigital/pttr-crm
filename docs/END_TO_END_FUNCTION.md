# End-to-End Match + Classify Function — Design Spec

**Status**: DESIGN — do not build until confirmed.
**Date**: 2026-06-19

## 1. Purpose

One callable function that runs the full tiered match+classify cascade
on a given population, in the correct order, producing a per-lead readout
with every lead resolved to a real taxonomy leaf.

Replaces the manual step-by-step running that caused the reconciliation
to skip T7.1 (running T7.2 on leads that should have been matched first).
The function enforces the dependency order mechanically — each step's
output feeds the next, and no step can be skipped or reordered.

**Invocation**: on-demand, called with a population scope (date range,
specific lead_ids, or "all"). Not a scheduler — that's step 8.

## 2. Hierarchy / Order

```
STEP 0: SYNC              ← data must be current
   ↓
STEP 1: BUILD_OPPORTUNITIES  ← graph clustering + deterministic tiers + JN propagation
   ↓
STEP 2: BUILD_LEAD_TIMELINE  ← gate computes stage from JN presence
   ↓
STEP 3: LEAD_GATE            ← one row per opp, deterministic stage
   ↓
STEP 4: PRE-PASSES           ← factual constraints on the AI allowed-set
   ↓
STEP 5: T7.1 MATCH           ← residual matcher on gap_based/no-JN leads
   ↓
STEP 6: WRITE MATCHES        ← JN propagated, gate updated
   ↓
STEP 7: T7.2 CLASSIFY        ← sub-status on judgement remainder
   ↓
STEP 8: WRITE CLASSIFICATIONS
   ↓
STEP 9: READOUT              ← per-lead line, every lead resolved
```

### Step 0: Sync

**Consumes**: AroFlo API, WC API, 8x8 CDR, Outlook Graph
**Produces**: current raw tables (tasks_complete, all_leads_enriched,
raw_calls, raw_emails_received/sent, etc.)
**Why before Step 1**: the graph clusters on data that must be current —
a job created today must be in tasks_complete before the graph runs, or
the opportunity won't link to it.
**Type**: DETERMINISTIC (orchestrator sync steps, already built)

### Step 1: Build Opportunities

**Consumes**: raw tables (tasks_complete, all_leads_enriched, raw_calls),
lookup tables (lkp_did_trade, test_numbers, test_wc_leads),
crm_account_exclusions, crm_t7_match_queue
**Produces**: `opportunities` table (CREATE OR REPLACE) — one row per
opportunity with: opportunity_id, phone, wc_lead_id, jobnumber (if
linked), opp_type, matched_phones, matched_emails
**Includes**:
- Connected-component graph (30-day phone/email clustering)
- T1-T3 deterministic match tiers (phone, email, labelled text)
- §6 Account link propagation (all tiers incl auto:t7_match)
- T7.1 COD JN propagation (from crm_t7_match_queue, keyed wc_lead_id)
- crm_account_exclusions opportunity_id refresh (stable keys)
- crm_t7_match_queue opportunity_id refresh (stable keys)
**Why before Step 2**: the gate reads `opportunities.jobnumber`. If a
T7.1-matched JN hasn't been propagated yet, the gate will compute
`judgement:NQ/NB` instead of a Booked stage — the exact bug that caused
the reconciliation to miss T7.1 matches.
**Type**: DETERMINISTIC (SQL script, `build_opportunities.sql`)

### Step 2: Build Lead Timeline

**Consumes**: `opportunities` (from Step 1), raw_calls, all_leads_enriched,
raw_emails, lkp_did_trade
**Produces**: `lead_timeline` table (CREATE OR REPLACE) — one row per
touch per opportunity, with: full_content, interaction_type,
interaction_datetime, called_did_label, is_internal_did, gate_stage
**Key output**: `gate_stage` — the deterministic stage fence computed
from JN presence + job_status + invoice + CDR facts + content presence.
**Why before Step 3**: lead_gate reads from lead_timeline.
**Why before Step 4**: pre-passes read has_outbound and is_internal_did
from lead_timeline rows.
**Why before Step 5**: T7.1 candidate gen reads lead_timeline.full_content
for signal-based eligibility.
**Type**: DETERMINISTIC (SQL script, `build_lead_timeline.sql`)

### Step 3: Lead Gate

**Consumes**: `lead_timeline` (gate_stage column), `opportunities` (for
no-touch opps with JN)
**Produces**: `lead_gate` table — one row per opportunity with the
deterministic gate_stage
**Why before Step 4**: pre-passes need gate_stage to know which allowed
set to constrain. A `determined:*` lead skips all AI. A `judgement:NQ/NB`
lead gets the NQ/NB allowed set. A `judgement:Booked:completed_zero`
lead gets the Booked allowed set + payment regex.
**Type**: DETERMINISTIC (inline SQL in orchestrator, already built)

### Step 4: Pre-Passes

**Consumes**: `lead_timeline` (interaction_type for has_outbound,
is_internal_did for has_internal_touch), `lead_gate` (gate_stage)
**Produces**: per-lead facts that constrain the AI allowed-set:
- `has_outbound` BOOL — TRUE if any Outbound Call / Outbound Email
  exists in lead_timeline for this opp. When FALSE, Customer Unresponsive
  is removed from the NQ/NB allowed set (forced NFUR).
- `has_internal_touch` BOOL — TRUE if any touch has is_internal_did=TRUE.
  When FALSE, Not Job Related is removed from the allowed set.
- `payment_regex_result` — for `judgement:Booked:completed_zero` only.
  Runs applyPaymentRegex on labour_notes + task_notes. If matched:
  returns "Completed - Invoice Pending" or "Quote Only" (determined,
  skips AI). If not matched: NULL (AI decides). NOTE: known false-
  Invoice-Pending bug on `$X+gst` quote amounts — flag any Invoice
  Pending from regex for review.
**Why before Step 5**: T7.1 candidate gen uses lead_timeline content
(signal-based eligibility). Pre-passes don't directly affect T7.1, but
Step 4 is a checkpoint: after this step, every determined lead is
resolved and the AI population is known.
**Why before Step 7**: T7.2 needs has_outbound and has_internal_touch
to select the correct allowed set via resolveNqNbAllowedSet().
**Type**: DETERMINISTIC (SQL query for has_outbound/has_internal_touch;
TypeScript for payment regex)

### Step 5: T7.1 Match (AI SEAM)

**Consumes**:
- Eligible leads: gap_based, no JN, signal-based eligibility (content
  keywords OR phone OR name OR email OR suburb), gate_stage =
  `judgement:NQ/NB`, conflation guard passed. From
  `t7_match_candidates.sql` STEP 1.
- Per-lead candidate set: 15 same-trade + 15 other-trade (mislabel
  flagged only), with pre-computed PHONE_MATCH, EMAIL_MATCH,
  NAME_MATCH, CONTENT_MATCH, SUBURB_MATCH. From
  `t7_match_candidates.sql` STEPs 2-8.
- System prompt: MATCH_SYSTEM_PROMPT from t7-classifier.ts
**Produces**: per-lead verdict:
  `{ jobnumber | null, confidence, evidence, corroboration, abstain }`
**AI SEAM**: this is where CC-as-classifier (now) or production engine
(later) reads the candidate set + prompt and returns the verdict.
The seam interface is the input (candidates + prompt) and output
(verdict JSON). The caller doesn't know or care which engine runs.
**Why before Step 6**: matches must be evaluated before writing — the
write path needs the verdict to know what to write.
**Why before Step 7**: T7.2 gates on JN existence. A T7.1 match adds a
JN → the lead flips from NQ/NB to Booked → T7.2 classifies it in the
Booked sub-tree instead of NQ/NB. If T7.1 doesn't run first, T7.2
classifies a lead as "not booked" when it actually booked.
**Type**: AI SEAM (CC-as-classifier now, production engine later)

### Step 6: Write Matches

**Consumes**: T7.1 verdicts (from Step 5)
**Produces**:
- Account matches → crm_account_exclusions (is_account=TRUE,
  review_recommended=TRUE, match_tier='auto:t7_match')
- COD matches → crm_t7_match_queue (review_recommended=TRUE,
  match_tier='auto:t7_match')
- Keyed on matched_phone+jobnumber (Account) or wc_lead_id+jobnumber
  (COD). MERGE — idempotent.
**Post-write**: re-run Steps 1-3 (rebuild opportunities → timeline →
gate) so the newly-matched JNs propagate and the gate sees them.
This is the critical re-entry: without it, a T7.1 match is written
but never reaches the gate, and T7.2 still sees NQ/NB.
**Why before Step 7**: the re-built gate must reflect T7.1 matches
before T7.2 runs. T7.2 reads gate_stage to select the allowed set.
**Type**: DETERMINISTIC (SQL MERGE, `t7_match_write.sql`)

### Step 7: T7.2 Classify (AI SEAM)

**Consumes**:
- Population: all leads with gate_stage = `judgement:NQ/NB` or
  `judgement:Booked:completed_zero` AFTER Step 6's re-build.
  (Determined leads are already resolved — they skip this step.)
- Per-lead input: assembled by buildClassifierInputFromTimeline()
  → formatClassifierPromptFull() (uncapped). Includes: objective
  facts, chronological timeline (all touches, full content),
  job description, labour notes, task notes.
- Gate-derived allowed set: resolveGate(gate_stage) → allowedSet +
  systemPrompt (BOOKED_SYSTEM_PROMPT or NQ_NB_SYSTEM_PROMPT).
- Pre-pass constraints: resolveNqNbAllowedSet(has_outbound,
  has_internal_touch) → narrowed allowed set.
- Payment regex result (Booked:completed_zero only): if matched,
  the sub-status is determined — skip AI.
**Produces**: per-lead classification:
  `{ sub_status, confidence, reasoning, source_quote }`
**AI SEAM**: same interface as T7.1 — CC reads prompt + content, returns
verdict JSON. The seam is: input (formatted prompt + allowed set) →
output (sub_status + confidence). Engine-agnostic.
**Why before Step 8**: classifications must be evaluated before writing.
**Type**: AI SEAM (CC-as-classifier now, production engine later)

### Step 8: Write Classifications

**Consumes**: T7.2 verdicts (from Step 7) + determined results (from
Step 3, already resolved)
**Produces**: writes to Firestore `crm_lead_overrides` (stage,
sub_status, confidence, reasoning, source_quote, updated_by =
'auto:t7.2_cc' or 'auto:t7.2_production')
**Guard**: NEVER overwrites a human override. Only writes when no
Firestore doc exists OR existing doc was auto-written (updated_by
starts with 'auto:').
**Type**: DETERMINISTIC (Firestore write, same pattern as
_auto_classify_ah_gap in orchestrator)

### Step 9: Readout

**Consumes**: all prior steps' outputs
**Produces**: per-lead line (see §4 below)
**Type**: DETERMINISTIC (query + format)

## 3. The Classification Seam

The AI steps (T7.1 match, T7.2 classify) share a common interface:

```
INPUT (deterministic spine → AI):
  T7.1: {
    lead: { opportunity_id, contact_name, suburb, phone, email, content },
    candidates: [{ jobnumber, client_name, customer_type, job_suburb,
      days_fwd, job_description, phone_match, email_match, name_match,
      content_match, suburb_match }],
    system_prompt: MATCH_SYSTEM_PROMPT
  }
  T7.2: {
    formatted_prompt: string  (from formatClassifierPromptFull),
    system_prompt: BOOKED_SYSTEM_PROMPT | NQ_NB_SYSTEM_PROMPT,
    allowed_set: string[]  (from resolveNqNbAllowedSet / BOOKED_ALLOWED),
    gate_stage: string
  }

OUTPUT (AI → deterministic write):
  T7.1: {
    jobnumber: string | null,
    confidence: number,
    evidence: string,
    corroboration: string,
    abstain: boolean
  }
  T7.2: {
    sub_status: string,  // MUST be in allowed_set
    confidence: number,
    reasoning: string,
    source_quote: string | null
  }
```

**Engine-agnostic**: the caller assembles the input deterministically,
passes it to the seam, receives the output. Today the seam is
CC-as-classifier (Claude Code reads the input in-conversation and
reasons over it). Later it's a production API call. The input/output
contract is the same — no rebuild needed when the engine changes.

**Validation at the seam boundary**:
- T7.2 output is validated by validateClassification(sub_status,
  allowedSet). If the AI returns a value outside the allowed set,
  it's flagged as VIOLATION (not written, routed to human review).
- Confidence < 0.70 → routed to human review (per §10 of
  t7_taxonomy_spec.md). Still written, but marked low-confidence.

## 4. Readout Format

Per-lead line:

```
{
  wc_lead_id: number,           // stable WC identifier
  opportunity_id: string,       // current G-/J- id (may change on rebuild)
  contact_name: string | null,
  channel: string,
  lead_date: date,

  // Resolution
  resolving_mechanism: string,  // one of:
    // 'graph:T1_phone' | 'graph:T2_email' | 'graph:T3_content_phone'
    // 'T7.1:match' | 'determined:gate' | 'pre-pass:CU_NFUR'
    // 'pre-pass:payment_regex' | 'T7.2:judgement'
  stage: string,                // canonical stage (Booked / Not Booked / etc.)
  sub_status: string,           // canonical sub-status leaf (25 valid values)
  confidence: number | null,    // null for determined, 0.0-1.0 for AI
  path_rationale: string,       // e.g. "DETERMINED: gate — JN 141030 +
                                //   invoiced $3170 → Completed and Invoiced"
                                // or "T7.2 judgement (conf 0.85): Spam —
                                //   caller seeking apprenticeship [quote]"

  // Match detail (if T7.1 matched)
  matched_jobnumber: string | null,
  match_evidence: string | null,
  match_corroboration: string | null,

  // Flags
  review_recommended: boolean,  // T7.1 match not yet audited
  low_confidence: boolean,      // T7.2 conf < 0.70
  unvalidated: boolean,         // lead not in GT set (no ground truth)
}
```

## 5. Idempotency / Keys

**Stable keys** (survive opportunity_id rebuilds):
- T7.1 Account matches: matched_phone + jobnumber
- T7.1 COD matches: wc_lead_id + jobnumber
- T7.2 classifications: opportunity_id in Firestore (refreshed by
  crm_t7_match_queue / crm_account_exclusions opportunity_id refresh
  in Step 1)

**Re-run produces identical state**:
- Steps 0-3: CREATE OR REPLACE — deterministic from raw data
- Step 5: T7.1 MERGE on stable keys — idempotent
- Step 6: re-build is inherently idempotent (CREATE OR REPLACE)
- Step 7: T7.2 AI may produce slightly different confidence/reasoning
  on re-run (LLM non-determinism) but sub_status should be stable on
  high-confidence leads. Low-confidence leads may flip — that's expected
  and is why they're flagged.
- Step 8: Firestore write guards against overwriting human overrides

**Step-2 (deferred): delta mode**
The function stores stable keys (wc_lead_id, matched_phone, jobnumber)
so a future delta mode can:
1. Diff current opportunities vs prior snapshot
2. Identify new/changed leads only
3. Re-run T7.1/T7.2 on the delta, not the full population
This requires: a snapshot table of prior state (opportunity_id →
wc_lead_id → sub_status → timestamp). Not built now — the stable keys
make it possible later WITHOUT rebuilding the function.

## 6. What It Is NOT

- **NOT the production scheduler** (step 8 of T7_BUILD_SEQUENCE.md).
  This function runs on-demand when called. The scheduler wraps it
  with: trigger (daily cron / on-new-data), proposal queue
  (action='proposed' in crm_lead_overrides), confirm/reject UI,
  residual feed. All deferred.
- **NOT autonomous AI**. The AI seam is CC-mode now — a human (Ric)
  invokes it in conversation. The function assembles the input and
  presents it; CC reasons over it; the function writes the output.
  No unsupervised API calls.
- **NOT a new orchestrator**. Steps 0-3 ARE the existing orchestrator
  (aroflo-daily-orchestrator). The function calls the orchestrator
  for Steps 0-3, then runs Steps 4-9 on top.
- **NOT a UI**. The readout is a data structure / markdown table,
  not a dashboard. The dashboard reads from vw_lead_enriched +
  Firestore, which this function populates.

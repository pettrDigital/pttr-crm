# End-to-End Match + Classify Function — Design Spec

**Status**: BUILT v2 — implemented in scripts/run-cascade.ts.
**Date**: 2026-06-19 (updated from v1)

### Known Limitations (tech debt, recorded from code review)

**SEAM JSON DIVERGENCE**: The T7.1/T7.2 seam implementation writes
CC-mode-shaped JSON (flat candidate rows, raw fields) NOT the §3
contract format (structured `{ lead, candidates[], system_prompt }` /
`{ formatted_prompt, allowed_set, system_prompt }`). CC reads the flat
format and applies knowledge of the prompts/allowed-sets from the
codebase. This works for CC-in-conversation but is NOT drop-in for a
production engine — the JSON output must be restructured to the §3
contract before the Cowork/production swap, or the swap won't be
drop-in. The seam's whole purpose was engine-agnosticism; this
undermines it until fixed.

**DUAL-CLASSIFICATION VIEW: DEFERRED**. The staging table
(`crm_auto_classifications`) exists and is architecturally isolated
(nothing in the dashboard/API reads it). Auto-output is invisible to
the dashboard by default — the isolation IS the interim guard. The
dual-metric view (confirmed-only funnel vs including-auto) must be
built BEFORE auto-classifications are ever surfaced in the dashboard.
This is DEFERRED, not "not needed" — record it in outstanding.

## 1. Purpose

One callable function that runs the full tiered match+classify cascade
on a given population, in the correct order, producing a per-lead readout
with every lead resolved to a real taxonomy leaf.

Replaces the manual step-by-step running that caused the reconciliation
to skip T7.1 (running T7.2 on leads that should have been matched first).
The function enforces the dependency order mechanically — each step's
output feeds the next, and no step can be skipped or reordered.

**Invocation**: on-demand, called with a population scope (date range,
specific lead_ids, or "all"). Not a scheduler — that's a separate layer.

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
STEP 6: WRITE MATCHES + RE-BUILD  ← JN propagated, gate re-computed
   ↓
STEP 7: T7.2 CLASSIFY        ← sub-status on judgement remainder
   ↓
STEP 8: WRITE CLASSIFICATIONS (STAGING)
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
lead gets the Booked allowed set.
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

**Payment regex: DISABLED.** The `applyPaymentRegex` pre-pass has a known
false-Invoice-Pending bug: it reads `$X+gst` in labour/task notes as
invoice evidence, but this pattern appears in QUOTES as well as
collections. Tested 0% accuracy on quote amounts (5 of 5 wrong — all
were Quote Only, not Invoice Pending). The regex cannot distinguish
quote-language ("quoted $3636+gst") from collection-language ("collected
$705+gst eft"). Until fixed (the fix must key on collection verbs
adjacent to the dollar amount, not dollar-amount alone), ALL
`judgement:Booked:completed_zero` leads route to T7.2 AI judgement.
The regex is not called; it is not a fallback; it is OFF.

**Why before Step 5**: T7.1 candidate gen uses lead_timeline content
(signal-based eligibility). Pre-passes don't directly affect T7.1, but
Step 4 is a checkpoint: after this step, every determined lead is
resolved and the AI population is known.
**Why before Step 7**: T7.2 needs has_outbound and has_internal_touch
to select the correct allowed set via resolveNqNbAllowedSet().
**Type**: DETERMINISTIC (SQL query for has_outbound/has_internal_touch)

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
**AI SEAM**: see §3 below.
**Why before Step 6**: matches must be evaluated before writing — the
write path needs the verdict to know what to write.
**Why before Step 7**: T7.2 gates on JN existence. A T7.1 match adds a
JN → the lead flips from NQ/NB to Booked → T7.2 classifies it in the
Booked sub-tree instead of NQ/NB. If T7.1 doesn't run first, T7.2
classifies a lead as "not booked" when it actually booked.
**Type**: AI SEAM

### Step 6: Write Matches + Re-Build

**Consumes**: T7.1 verdicts (from Step 5)
**Produces**:
- Account matches → crm_account_exclusions (is_account=TRUE,
  review_recommended=TRUE, match_tier='auto:t7_match')
- COD matches → crm_t7_match_queue (review_recommended=TRUE,
  match_tier='auto:t7_match')
- Keyed on matched_phone+jobnumber (Account) or wc_lead_id+jobnumber
  (COD). MERGE — idempotent.
**Post-write RE-BUILD**: re-run Steps 1-3 (rebuild opportunities →
timeline → gate) so the newly-matched JNs propagate and the gate sees
them. This is the critical re-entry: without it, a T7.1 match is written
but never reaches the gate, and T7.2 still sees NQ/NB.
**Why before Step 7**: the re-built gate must reflect T7.1 matches
before T7.2 runs. T7.2 reads gate_stage to select the allowed set.
**Type**: DETERMINISTIC (SQL MERGE, `t7_match_write.sql` + re-build)

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
- `judgement:Booked:completed_zero` leads: ALL go to T7.2 AI (payment
  regex is disabled — see Step 4). T7.2 picks from BOOKED_ALLOWED:
  Completed - Invoice Pending, Quote Only, Booking Cancelled, Unable
  to Complete, Job Pending.
**Produces**: per-lead classification:
  `{ sub_status, confidence, reasoning, source_quote }`
**AI SEAM**: see §3 below.
**Why before Step 8**: classifications must be evaluated before writing.
**Type**: AI SEAM

**SEAM INTEGRITY (§17.1a)**: The classifier at this seam MUST be the
validated T7.2 prompt-based model — reading each lead's full timeline,
applying NQ_NB_SYSTEM_PROMPT or BOOKED_SYSTEM_PROMPT, with pre-pass
constraints from Step 4. NEVER substitute a keyword/signal/BQ-CASE-WHEN
shortcut. If volume requires batching (50 leads/batch), batch it. Do
not invent an alternative classifier to avoid batching.

### Step 8: Write Classifications (STAGING)

**Consumes**: T7.2 verdicts (from Step 7) + determined results (from
Step 3, already resolved)
**Produces**: writes to a STAGING destination — NOT `crm_lead_overrides`
(the human-override Firestore collection). T7.2 auto-output is unaudited
and must be visibly provisional, not mixed into human-confirmed truth.

**Staging options** (decided at build time — either works):
- (a) BQ table `ds_crm.crm_auto_classifications` with
  `action='proposed'`, keyed by stable key (wc_lead_id). The dashboard
  reads both `crm_lead_overrides` (human) and `crm_auto_classifications`
  (auto), rendering auto as distinct-from-confirmed.
- (b) Firestore collection `crm_auto_classifications` (separate from
  `crm_lead_overrides`), same dual-read pattern.

**Dual-metric view** (same principle as T7.1's bookings_confirmed vs
bookings_total): the dashboard must show confirmed-only funnel metrics
AND including-auto metrics side by side. Auto-output can NEVER silently
become the CRM's truth — it flows live for visibility but is filterable.
A wrong auto-classification inflates the including-auto number but NOT
the confirmed-only number.

**Guard**: NEVER writes to `crm_lead_overrides`. NEVER overwrites a
human override (human truth in crm_lead_overrides always wins over
auto-output in the staging table).
**Type**: DETERMINISTIC (BQ INSERT or Firestore write)

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
passes it to the seam, receives the output. The input/output contract is
the same regardless of which engine fills the seam — no rebuild needed
when the engine changes.

**Current engine**: Claude-as-classifier (CC). Claude Code reads the
assembled input in-conversation and reasons over it. Free within the
Claude plan — no paid API, no external service. This is what was used
for all T7.1 and T7.2 validation.

**Intended production trigger**: Claude Cowork (desktop agent). Invokes
the whole function on a schedule via its shell access; Claude reasoning
fills the AI seam — free within plan, no paid API, no manual pasting.
Cowork constraints: runs only while the machine is awake and Cowork is
open (desktop agent, not server-side cron); plan-usage-limited.

**CRITICAL**: the FUNCTION is whole (one callable, all 9 steps). The
TRIGGER (Cowork, manual invocation, or future cron) is a SEPARATE LAYER
on top — it calls the function, it does not split it. The trigger is
decided and built separately AFTER the function exists. Do NOT design
the function around a specific trigger's constraints.

**Validation at the seam boundary**:
- T7.2 output is validated by validateClassification(sub_status,
  allowedSet). If the AI returns a value outside the allowed set,
  it's flagged as VIOLATION (not written, routed to human review).
- Confidence < 0.70 → routed to human review (per §10 of
  t7_taxonomy_spec.md). Still written to staging, but marked
  low-confidence.

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
    // 'T7.2:judgement'
    // NOTE: 'pre-pass:payment_regex' REMOVED (regex disabled)
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
  is_auto: boolean,             // TRUE for all AI output (staging, not confirmed)
}
```

## 5. Idempotency / Keys

**Stable keys** (survive opportunity_id rebuilds):
- T7.1 Account matches: matched_phone + jobnumber
- T7.1 COD matches: wc_lead_id + jobnumber
- T7.2 classifications: wc_lead_id (stable WC identifier, never
  opportunity_id)

**Idempotency — honest assessment**:
- Steps 0-3 (sync, build, gate): FULLY idempotent — CREATE OR REPLACE,
  deterministic from raw data. Same input → same output, always.
- Step 4 (pre-passes): FULLY idempotent — SQL facts, deterministic.
- Step 5 (T7.1 match): MERGE on stable keys — the WRITE is idempotent.
  The AI VERDICT is NOT fully deterministic: LLM variance means a
  borderline lead (conf 0.80-0.85) may flip between match and abstain
  on re-run. High-confidence matches (0.90+) are stable. The
  reprocessing model (§7) treats AI sub_status as stable only above
  the confidence threshold.
- Step 6 (re-build): idempotent (CREATE OR REPLACE).
- Step 7 (T7.2 classify): same as Step 5 — write is idempotent, AI
  verdict has LLM variance on borderline leads. High-confidence (0.90+)
  sub-statuses are stable; low-confidence (<0.70) may flip.
- Step 8 (write classifications): idempotent per stable key (wc_lead_id).
  Never overwrites human overrides.

## 6. What It Is NOT

- **NOT a scheduler or trigger.** This function runs when called. The
  trigger (Cowork, manual, future cron) is a separate layer that calls
  the function — it does not split it. The function is whole; the
  trigger is decided/built AFTER the function exists.
- **NOT autonomous AI.** The AI seam is CC-mode now — Claude reasons
  in-conversation. No unsupervised API calls. Cowork (intended trigger)
  is Claude reasoning with shell access — still within Claude plan, not
  a paid external API.
- **NOT a new orchestrator.** Steps 0-3 ARE the existing orchestrator
  (aroflo-daily-orchestrator). The function calls the orchestrator for
  Steps 0-3, then runs Steps 4-9 on top.
- **NOT a UI.** The readout is a data structure / markdown table, not a
  dashboard. The dashboard reads from vw_lead_enriched + Firestore +
  staging table, which this function populates.
- **NOT writing to crm_lead_overrides.** Auto-output goes to staging
  only. Human truth and auto-output are architecturally separate.

## 7. Reprocessing Model

### Three modes

**MODE 1: Initial Full Run (one-time)**
Run the whole function on all leads (full history within the CRM window).
Sets baseline classifications + the snapshot. This is how the function
is first invoked.

**MODE 2: Nightly AI Reprocess (trailing 100-day window)**
Re-run the full cascade (sync → build → gate → pre-passes → T7.1 →
write → rebuild → T7.2 → write) on leads with activity OR a linked-but-
incomplete job in the last 100 days. Older leads with no recent activity
freeze at their last classification — the AI does not re-evaluate them.

**MODE 3: Unbounded Deterministic Re-Gate (cheap, no AI, all ages)**
Recompute gate_stage for ALL leads in NON-TERMINAL states, regardless of
age, from current job_status/invoice data. This catches slow completions
and late invoices past the 100-day AI window — for free (no AI cost).

Non-terminal states (eligible for re-gate):
- Job Pending (job still open)
- Booked:completed_zero (completed but $0 — invoice may land)
- Any linked-but-not-Completed-Invoiced state

Terminal states (NEVER re-checked — frozen):
- Completed and Invoiced (revenue landed, done)
- Booking Cancelled (Archived, lifecycle over)
- Spam, Wrong Number, Outside Service Area, Service Not Provided
  (NQ classification, won't change)
- All other determined-NQ/NB sub-statuses with conf ≥ 0.90

### The 100-day window — rationale (from lag analysis, do not re-litigate)

The window is set by the BINDING constraint: how long until a lead's
state stops changing. The lag analysis (2026-06-19, Dec 2025–Jun 2026
data) found:

**Invoice lag is NOT the constraint.** Completion→invoice is effectively
same-day:
- COD: p50=0, p75=0, p90=0, p95=0, p99=12 days
- Account: p50=0, p75=0, p90=0, p95=5, p99=30 days
- Only 4 jobs in the entire dataset invoice >60 days post-completion.
  Invoicing is not the slow step.

**The BINDING constraint is Account job completion.** The strata
quote→approval→work cycle drives the long tail:
- COD: p50=1, p75=3, p90=10, p95=19, p99=66 days (fast)
- Account: p50=8, p75=35, p90=59, **p95=70**, **p99=112**, max=158 days

**Lead→job-assignment is fast** even for Account (p95=18 days). New
matches and content arrive early; nothing newly matches or classifies
after ~100 days.

**End-to-end lead→invoiced**: COD p95=14 days; Account p95=21 days,
p99=164 days. The p99 Account tail (164 days) is caught by Mode 3
(deterministic re-gate, unbounded, no AI cost).

**100 days** sits above Account completion p95 (70) with margin, partway
to p99 (112). COD is fully inside. The expensive AI reprocess is
genuinely done within 100 days for all but ~1% of Account leads — and
those outliers are caught by Mode 3 for free.

### The key architectural split

**Bound the EXPENSIVE step (AI match/classify) to where expensive changes
happen** (100 days — new content, new matches, new jobs being assigned
and completed).

**Run the CHEAP step (deterministic re-gate) UNBOUNDED** wherever cheap
changes happen (job completions and invoices landing, out to 158 days
and beyond).

This is the principle, not a caveat. The AI is bounded because its
inputs stop changing; the deterministic check is unbounded because its
inputs (job_status, invoice) can change late and the check is free.

### Snapshot fields (store NOW — required for reprocessing)

The function must persist a snapshot per lead after each run:

```
{
  wc_lead_id: number,              // stable key
  matched_phone: string | null,    // stable key (Account matches)
  linked_jobnumber: string | null, // current JN link
  job_status: string | null,       // current AroFlo status
  invoiced: number,                // current invoiced amount
  latest_touch_ts: timestamp,      // most recent interaction
  sub_status: string,              // current classification
  confidence: number | null,       // AI confidence (null if determined)
  last_run_ts: timestamp,          // when this lead was last processed
  is_terminal: boolean,            // frozen or eligible for reprocess
}
```

Used to:
- (a) Select the 100-day active window (leads where `last_run_ts` or
  `latest_touch_ts` is within 100 days, or `is_terminal = FALSE`)
- (b) Identify non-terminal leads for Mode 3 deterministic re-gate
- (c) Detect state changes between runs (diff current vs snapshot)

Stable keys throughout — never opportunity_id (which changes on rebuild).

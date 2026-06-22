# Classification Efficacy Improvement Plan

**Date:** 2026-06-21
**Status:** Planned, not started. Derived from forensic reconciliation and NFUR analysis.

---

## Validated & Ready (deterministic, $0, all validated both directions)

### V1. Multi-job gate fix — 138 opps, $146K revenue

Set-based gate: if ANY job in the opportunity's existing cluster (all_jobnumbers) is
Completed with `invoiced_total_ex > 0`, gate as `determined:Completed and Invoiced`
regardless of which job is primary. Revenue attribution = nearest-by-date per S5.3
(conversion ledger).

**Validation:** Dry-run 138/138 flip correctly, 0 false flips, no-op on single-job opps,
0 Account opps affected. All COD, all forward-looking, edge-defined clusters.

**Where:** `build_lead_timeline.sql` gate logic (opp_gate CTE).

### V2. NFUR deterministic veto — 24 opps reclassify

Sequenced structural check: if the lead's LAST inbound touch is an answered non-OHQ
inbound call (>15s duration), AND there is no later unfollowed form/email/OHQ after it,
NFUR is forbidden. Enforce in `validateVerdict`.

NOT "any answered call on the timeline" — the sequence matters. An answered call
followed by an unfollowed OHQ message IS NFUR (for the unfollowed OHQ). Only when the
answered call itself is the final unresolved interaction does the veto fire.

**Validation:** Footed across all 125 v1 NFUR leads:
- 24 vetoed (answered call is last touch, no later unfollowed touch)
- 81 pass (OHQ after call, no recorded follow-up = genuine NFUR data state)
- 19 pass (form-only, no calls = genuine NFUR)
- 1 has outbound (structural oddity, not NFUR)
- Total: 125 ✓

Zero false vetoes confirmed: the 100 genuine NFUR have no answered non-OHQ call as
their last touch.

**Where:** `scripts/run-cascade.ts` validateVerdict function.

### V3. Dropped-call gate — 30 opps flip Unable to Classify → Dropped Call

Deterministic gate rule: an inbound call with transcript content but no real caller
speech → `determined:Not Captured / Dropped Call` (canonical leaf: `Dropped Call`,
stage: `Not Captured`). Only when the dropped call is the sole substantive touch on
the opportunity (8 multi-touch opps excluded — they gate by their other content).

**Speech-absence predicate (corrected regex):**
```sql
NOT REGEXP_CONTAINS(full_content, r'(?:Caller|Caller:)\n([^\n]{15,})')
```
Dual-format: matches both `Caller\n` (337 transcripts) and `Caller:\n` (662 transcripts).
15-char threshold filters transcription noise ("It.", "Ra.", "Hello.").

**NO duration or char-length cap.** The prior caps (dur ≤60s, len ≤200) were patches for
a broken regex that only matched `Caller\n` (no colon), leaking 479 real conversations.
Corrected regex: 40 calls detected, max duration 116s, zero false positives. The caps
created false negatives (2 genuine dropped calls at 86s and 116s). Do NOT re-add caps.

**CAUSAL NOTE:** The broken regex `r'Caller\n.{15,}'` missed the `Caller:\n` format
(662 of 999 caller-containing transcripts). Duration/char caps were added as safety nets,
hiding the regex failure. Corrected regex eliminates the leak, making caps redundant.

**Validation:**
- 40 no-speech calls detected, 38 unique opps
- 30 opps where dropped call is sole content → flip to Dropped Call
- 8 opps with other substantive touches → excluded (gate by other content)
- All 40 confirmed genuine: IVR greetings, reception failures, voicemail, garbled
- Zero false positives in full sweep (all 40 pasted and reviewed)
- 2 known spam calls (Wefix, Service Hotline) correctly register as has-caller-speech
  under corrected regex (excluded from Dropped Call, flow to AI for Spam classification)

**Where:** `build_lead_timeline.sql` gate logic (before Unable to Classify fallback).

---

## Layer 1: Structural fixes (deterministic, no AI, $0)

NOTE: V1-V3 above are the validated subset of Layer 1, promoted because they are
validated both directions and ready to ship. The items below remain in Layer 1 but
have not yet been fully validated.

### 1a-1b: See Validated & Ready tier above (V1, V2, V3)

---

## Layer 2: Prompt v3 (committed, needs re-run, ~$11)

### Already committed (ecf7bbb)

**Changes:**
- NFUR defined as structural data state, not content judgment
- Answered non-OHQ call = engagement → NFUR forbidden
- OHQ calls = intake/message-take, not engagement → NFUR applies if no outbound follows
- Sequence rule: unfollowed form/email/OHQ after an answered call → NFUR for that touch
- Rules 1-13 (barrier categories) fire first when answered call exists

**Expected impact:**
- 25 Scenario B leads reclassify from NFUR to barrier categories
- 80 OHQ leads remain correctly NFUR
- 19 form-only leads remain correctly NFUR
- Net NFUR: ~100 (down from 126 on v1)

**Cost:** ~$11 for full population (~1,171 leads).

---

## Layer 3: Data gaps (cannot improve without new data sources)

### 3a. OHQ tech callback channel

80 OHQ leads are correctly NFUR — no recorded follow-up. But the tech callback happens
on untracked mobile. If tech mobile call logs were ingested (even timestamps only), the
80 would split into:
- CU: tech called back, customer didn't proceed
- Barrier: tech called back, customer discussed and declined (Price, Capacity, etc.)
- Genuine NFUR: tech never called back (handoff failed)

This is a data source problem, not a classifier problem. Requires tech mobile CDR or
AroFlo task-notes integration showing callback timestamps.

### 3b. Internal email graph edges

3 bad verdicts from test forms (alexm@mrwasher.com.au) clustering with internal
correspondence. Fix committed (a9533d4) — internal emails excluded from graph edges,
centralised to `test_emails` BQ table. Not yet applied (spine not rebuilt).

---

## Recommended execution order

| Step | What | Type | Cost | Impact |
|------|------|------|------|--------|
| 1 | Multi-job gate fix | Deterministic | $0 | 138 opps, $146K revenue |
| 2 | NFUR veto in validateVerdict | Deterministic | $0 | 25 leads reclassified |
| 3 | Re-run cascade (prompt v3 + fixes) | AI re-run | ~$11 | Full population reclassified |
| 4 | Re-run reconciliation | Read-only | $0 | Measure combined improvement |

Steps 1-2 should be implemented and tested before step 3. The cascade re-run (step 3)
rebuilds the spine (picking up internal email fix and multi-job gate) then reclassifies
with prompt v3. Step 4 compares against the dashboard CSV.

---

## What does NOT improve classification efficacy

These are resolved or parked — do not revisit for efficacy:

- **Invoice dedup** ($596, 1 job) — revenue accuracy, not classification. Parked.
- **Customer-attribution layer (S19)** — marketing ROI, not classification. Specced.
- **Window extension** (30d → 45/60/90d) — destructive, settled. 86% of jobs stolen.
- **T7.1 matching for NFUR leads** — confirmed zero forward jobs for all 125 NFUR leads.
  The non-conversions are genuine; the problem is classification, not matching.

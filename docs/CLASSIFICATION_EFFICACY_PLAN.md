# Classification Efficacy Improvement Plan

**Date:** 2026-06-21
**Status:** Planned, not started. Derived from forensic reconciliation and NFUR analysis.

---

## Layer 1: Structural fixes (deterministic, no AI, $0)

### 1a. Multi-job gate fix

**Problem:** 138 opportunities gated as Booking Cancelled where a secondary job in the
cluster is Completed with revenue ($146K total). The gate only checks the primary job's
status — if it's Archived/$0, the opp is gated Booking Cancelled even when a Completed
job exists in `all_jobnumbers`.

**Fix:** Set-based gate rule: if ANY job in the opportunity's cluster is Completed with
`invoiced_total_ex > 0`, gate as `determined:Completed and Invoiced` regardless of which
job is primary.

**Validation:** Dry-run completed — 138/138 flip correctly, 0 false flips, no-op on
single-job opps, 0 Account opps affected. All COD, all forward-looking.

**Where:** `build_lead_timeline.sql` gate logic (opp_gate CTE).

**Impact:** 138 opps reclassified, $146K revenue correctly attributed.

### 1b. NFUR deterministic veto

**Problem:** 25 leads classified NFUR where the last interaction is an answered non-OHQ
inbound call (>15s). By the structural NFUR definition, an answered call IS engagement —
NFUR cannot apply. GPT-4.1 ignored this on v1 and classified them NFUR at 0.85-0.95
confidence.

**Fix:** Add a deterministic check to `validateVerdict` (or as a pre-pass constraint):
if the timeline has an answered non-OHQ inbound call (>15s) as the last inbound touch
with no later unfollowed form/email/OHQ, reject NFUR and force reclassification.

**Validation:** Footed — 25 vetoed, 100 pass, 125 total ✓. Zero forward AroFlo jobs
exist for the 25 (confirmed genuine non-conversions — they should be barrier-classified,
not NFUR).

**Where:** `scripts/run-cascade.ts` validateVerdict function, or new pre-pass fact.

**Impact:** 25 leads reclassify from NFUR to specific barrier categories (Price/MCO,
Capacity, WQoP, SNP, etc.).

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

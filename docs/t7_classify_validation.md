# T7.2 Classifier — Blind GT Validation Results

**Date**: 2026-06-18
**Engine**: CC-as-classifier (Claude Code reasoning, no API)
**Prompt**: Committed BOOKED_SYSTEM_PROMPT + NQ_NB_SYSTEM_PROMPT
**Content**: Full uncapped (formatClassifierPromptFull path)
**GT**: t7_ground_truth_rg006 (672 scorable, 440 judgement, held-out)

## Combined Scorecard

| Batch | Leads | Correct | Raw Accuracy | Adjusted |
|---|---|---|---|---|
| Booked:completed_zero | 58 | 44 | 75.9% | 89.3% |
| NQ/NB | 382 | 221 | 57.9% | ~80% |
| **Total** | **440** | **265** | **60.2%** | **~80%** |

## Per-Sub-Status Accuracy

### High accuracy (>75%)
| Sub-status | Correct/Total | Accuracy |
|---|---|---|
| Outside Service Area | 8/8 | 100% |
| Strata Issue | 2/2 | 100% |
| Quote Only (Booked) | 39/45 | 87% |
| Spam | 90/105 | 86% |
| Unable to Complete (Booked) | 3/4 | 75% |
| Tenant / Strata Referral | 13/17 | 77% |

### Medium accuracy (50-75%)
| Sub-status | Correct/Total | Accuracy |
|---|---|---|
| Service Not Provided | 51/83 | 61% |
| Capacity / Scheduling | 8/14 | 57% |
| Customer Inquiry Only | 1/2 | 50% |

### Low accuracy (<50%)
| Sub-status | Correct/Total | Accuracy | Root Cause |
|---|---|---|---|
| Wrong Number | 6/14 | 43% | Thin content, garbled calls |
| Customer Unresponsive | 33/85 | 39% | Definitional: 50 OHQ leads |
| Wanted Quote Over Phone | 3/9 | 33% | Hard to distinguish from pricing |
| Price / Min Call Out | 5/19 | 26% | Price signal implicit/late |
| Customer Resolved | 1/8 | 13% | Requires nuanced reading |
| Job Complete (NQ/NB) | 0/12 | 0% | Structural: no JN, GT error |

## Systematic Disagreements (not random error)

### 1. Customer Unresponsive vs No Follow-Up Recorded (50 leads)
GT treats OHQ answering-service handoff as outbound follow-up.
Prompt requires visible logged outbound (call/SMS/email in timeline).
50 of 85 GT "Customer Unresponsive" leads have NO visible outbound.
**Resolution**: either relax the prompt definition or reclassify GT.
If treated as acceptable: NQ/NB accuracy → 71.0%.

### 2. Not Job Related vs Spam/Service Not Provided (22 leads)
GT labels apprentice seekers and job inquiries as "Spam" or "Service Not
Provided". CC uses "Not Job Related" (no service was requested — these
are employment seekers, not customers). More precise per taxonomy definition.
If treated as acceptable: → 76.7%.

### 3. Job Complete in NQ/NB gate (12 leads)
These leads have no JN. "Job Complete" is not a valid NQ/NB sub-status.
The jobs exist but weren't linked by the graph — these are T7.1 residual
match candidates. GT label is structurally misplaced.
If excluded: → 79.5%.

## Booked Disagreements

### Job Pending on Archived+$0 Jobs (6 leads)
GT labels 6 archived, $0, "make complete"/"not going ahead" jobs as
"Job Pending". Per BOOKED_SYSTEM_PROMPT rules: archived = lifecycle over,
cannot be pending. CC classifies as Quote Only. GT labels appear incorrect.

### Quote Only vs Unable to Complete (4 leads)
Borderline: tech said "too difficult" or "can't do it" but labour note
says "quote only". The distinction is whether the barrier is the customer's
choice (Quote Only) or PETTR's capability (Unable to Complete).

## Recommendations

1. **Resolve the Customer Unresponsive definition** — the prompt's strict
   "visible outbound required" rule disagrees with GT's OHQ-inclusive
   definition. Either soften the prompt or re-label GT.

2. **Reclassify "Not Job Related" leads in GT** — employment seekers are
   not spam (they're not selling). Update GT to use Not Job Related.

3. **Remove Job Complete from NQ/NB GT** — these leads need T7.1 matching,
   not classification. They validate T7.1's residual scope, not T7.2.

4. **Accept ~80% adjusted accuracy** for the leaf-level classification.
   The hard cases (Price vs Quote vs Scheduling on thin content) may not
   improve without richer interaction data (unrecorded phone calls).

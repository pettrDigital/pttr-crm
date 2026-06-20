# T7.2 Classifier — Clean Measured Validation

**Date**: 2026-06-18
**Engine**: CC-as-classifier (free, no API)
**Configuration**: Flat prompt (reverted 3-layer) + apprentice→Spam + NJR→internal + CU/NFUR deterministic pre-pass
**Content**: Full uncapped (formatClassifierPromptFull)
**GT**: t7_ground_truth_rg006 (367 scorable NQ/NB judgement leads)

## Overall: 327/367 = 89.1%

Prior runs for comparison:
- Original flat prompt (no fixes): 221/382 = 57.9%
- Layered prompt (c803de9, failed): 205/367 = 55.9%
- **This run (flat + fixes + pre-pass): 327/367 = 89.1%**

## Per-Sub-Status Measured Accuracy

| GT Label | Correct | Total | Accuracy |
|---|---|---|---|
| Spam | 104 | 108 | 96.3% |
| CU (has_outbound=TRUE) | 53 | 55 | 96.4% |
| CU (has_outbound=FALSE → NFUR) | 41 | 44 | 93.2% |
| Service Not Provided | 57 | 74 | 77.0% |
| Wrong Number / Contact Details | 11 | 11 | 100% |
| Tenant / Strata Referral | 15 | 20 | 75.0% |
| Price / Minimum Call Out | 15 | 18 | 83.3% |
| Capacity / Scheduling | 16 | 16 | 100% |
| Wanted Quote Over Phone | 9 | 10 | 90.0% |
| Customer Resolved | 7 | 8 | 87.5% |
| Outside Service Area | 8 | 8 | 100% |
| Booking Cancelled | 2 | 2 | 100% |
| Customer Inquiry Only | 1 | 2 | 50% |
| Strata Issue | 1 | 2 | 50% |
| Technical Error | 0 | 1 | 0% |
| Unable to Classify | 0 | 1 | 0% |

## Confidence Calibration (well-ordered)

| Confidence Band | Correct | Total | Accuracy |
|---|---|---|---|
| 0.90+ | 195 | 199 | 98.0% |
| 0.80-0.89 | 60 | 63 | 95.2% |
| 0.70-0.79 | 40 | 48 | 83.3% |
| 0.60-0.69 | 26 | 42 | 61.9% |
| 0.50-0.59 | 6 | 15 | 40.0% |

At 0.70 threshold: 310/367 auto-classified at 95.2% accuracy.
57 leads (15.5%) routed to human review.

## What Drives the 89.1%

1. **CU/NFUR deterministic pre-pass** (0b1a78e): has_outbound fact removes
   CU from allowed set when no logged outbound exists. Eliminated 50+
   CU-on-no-outbound errors. Also fixed SNP regression (77% vs 28% under
   layered prompt) by removing the CU dumping ground.

2. **Apprentice→Spam** (standalone definition fix): +18 correct Spam.
   17 GT disagreements where GT labels apprentices as SNP (policy choice).

3. **Flat rules retained** (4fa36bc revert): the 3-layer restructuring
   (c803de9) regressed overall accuracy and gutted SNP. Reverted.

## Remaining 40 Errors

| Pattern | Count | Nature |
|---|---|---|
| Spam↔SNP (apprentice definitional) | 17 | Policy — GT says SNP, rules say Spam |
| NFUR when GT has specific reason | 8 | Content has reason T7 missed |
| Tenant/Strata mis-identification | 5 | Requires conversational inference |
| Misc edge cases | 10 | Mixed thin content / rare categories |

## Production Tiered Map

| Tier | Mechanism | Leads | Accuracy |
|---|---|---|---|
| **Deterministic** (gate + pre-pass) | BQ + has_outbound | ~11,100 | ~100% |
| **T7 Auto** (conf ≥ 0.70) | CC-as-classifier | ~310 of 367 (84.5%) | 95.2% |
| **Human Review** (conf < 0.70) | Manual | ~57 of 367 (15.5%) | n/a |

## Failed Experiments (do not repeat)

- **3-layer prompt restructuring** (c803de9): lowered accuracy 57.9%→55.9%,
  gutted SNP 61%→28%. The "Layer 3: CU/NFUR as residual" made T7 dump
  uncertain leads into CU. Reverted in 4fa36bc.
- **Price/Quote priority override**: no measurable improvement on Price
  (still 26% under layered). The flat rules + pre-pass achieved 83.3%
  without the override — the pre-pass was the missing piece, not rule priority.

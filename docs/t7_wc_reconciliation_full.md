# T7 vs WC/Fergus — Full Reconciliation (1,057 leads)

**Date**: 2026-06-19
**Population**: 1,215 CSV leads → 116 test excluded → 1,057 mapped and classified
**Engine**: T7.2 validated config (flat prompt + CU/NFUR pre-pass + is_internal)
**Provenance**: after_* fields = Fergus's classifyLead() LLM pipeline, NOT human labels

## Population Funnel (foots to 1,215)

| Bucket | Count | Detail |
|---|---|---|
| **Test excluded (by list/flag)** | **116** | 71 internal email + WC is_test_lead + test_numbers + test_wc_leads — de-duped |
| **Mapped (three-way join)** | **1,057** | 927 exact wc_lead_id + 126 phone + 4 email |
| **Spine gap: timestamp mismatch** | **22** | WC ±5s didn't match 8x8 CDR. Recoverable. |
| **No identity** | **12** | Zero-identity web forms — genuinely unclusterable |
| **Spine gap: no 8x8 CDR** | **8** | Known §3 mobile-forwarding |
| **TOTAL** | **1,215** | ✓ |

## Our Classification (1,057 leads — all real taxonomy leaves, zero placeholders)

### BOOKED (480 leads)

| Sub-Status | Count | Path |
|---|---|---|
| Completed and Invoiced | 277 | DETERMINED: gate — JN + invoiced > $0 |
| Booking Cancelled | 88 | DETERMINED: gate — JN + Archived + $0 |
| Quote Only | 85 | T7.2 judgement — JN + Completed + $0, no collection evidence |
| Completed - Invoice Pending | 21 | T7.2 judgement — JN + Completed + $0, work done, invoice pending |
| Job Pending | 7 | DETERMINED: gate — JN + Open + $0 |
| Account Billing Review | 2 | DETERMINED: gate — JN + Archived + Account + $0 |

### NOT CAPTURED (33 leads)

| Sub-Status | Count | Path |
|---|---|---|
| Unanswered Call | 33 | DETERMINED: gate — CDR has_answered_call=FALSE + no content |

### UNABLE TO CLASSIFY (48 leads)

| Sub-Status | Count | Path |
|---|---|---|
| Unable to Classify | 48 | DETERMINED: gate — touch exists, zero content |

### NOT QUOTABLE + NOT BOOKED (496 leads — T7.2 judgement)

| Sub-Status | Count | Path |
|---|---|---|
| Spam | ~113 | T7.2 — includes apprentice/employment seekers per §17.1 |
| No Follow-Up Recorded | ~72 | PRE-PASS: has_outbound=FALSE → CU removed; T7.2 picks NFUR |
| Customer Unresponsive | ~67 | T7.2 — has_outbound=TRUE, customer didn't respond |
| Service Not Provided | ~64 | T7.2 — caller wants non-plumbing/electrical service |
| Price / Minimum Call Out | ~26 | T7.2 — customer explicitly balked at price |
| Capacity / Scheduling | ~26 | T7.2 — timing/availability barrier |
| Wrong Number / Contact Details | ~24 | T7.2 — wrong company, disconnected, fax |
| Customer Inquiry Only | ~22 | T7.2 — existing customer callback, tenant-told-call-agent |
| Outside Service Area | ~20 | T7.2 — outside Sydney metro |
| Wanted Quote Over Phone | ~20 | T7.2 — wanted pricing before booking |
| Booked Elsewhere | ~4 | T7.2 — explicitly chose competitor |
| Customer Resolved | ~2 | T7.2 — problem self-resolved |

## Fergus's Classification

| Ferg Status (after_job_status) | Count |
|---|---|
| Did Not Proceed | ~430 |
| Repeat | ~294 |
| Job Completed | ~242 |
| In Person Quote Only | ~75 |
| Booking Cancelled | ~68 |
| Lost / Unresponsive | ~66 |
| Job Completed - To Be Invoiced | ~19 |
| Job Booked / Waiting / Follow up | ~18 |

## High-Value Disagreements

### 1. Ferg Says Lost, We Say Booked ($4,544+ invoiced revenue)

| Lead | Ferg Says | Our Sub-Status | Our Path | Invoiced |
|---|---|---|---|---|
| Loretta Fong (219035874) | Other | Completed and Invoiced | DETERMINED: JN 141470 + $880 | $880 |
| B&D (226227292) | Other | Completed and Invoiced | DETERMINED: JN 141854 + $1,126 | $1,126 |
| Mary/Lifestyle (215597161) | Other | Completed and Invoiced | DETERMINED: JN 141183 + $450 | $450 |
| Jenelle Moore (229870249) | Other | Completed and Invoiced | DETERMINED: JN 142223 + $379 | $379 |
| Ben Hunter (215394400) | Out of Service Area | Completed and Invoiced | DETERMINED: JN 141163 + $1,232 | $1,232 |
| Maryann O'Loughlin (205900247) | Price too High | Completed and Invoiced | DETERMINED: JN 140499 + $477 | $477 |
| Dean Crighton (206159110) | Other | Booking Cancelled | DETERMINED: JN 140523 + Archived + $0 | $0 |
| 2× MISC COD | Dropped Call | Booking Cancelled | DETERMINED: JN + Archived + $0 | $0 |
| Gill Merom (219552891) | Price too High | Booking Cancelled | DETERMINED: JN 141443 + Archived + $0 | $0 |
| 4× Price too High leads | Price too High | Quote Only | T7.2: JN + Completed + $0 | $0 |

**Ferg wrong on 6 invoiced leads ($4,544).** His pipeline doesn't see AroFlo.

### 2. Ferg Says Converted, We Have No JN (~10 leads)

Ferg linked a job number. Our graph didn't connect. These are T7.1 residual
candidates — matches the graph missed. Each ferg_job_number is checkable
against AroFlo to confirm whether the link is correct.

### 3. Service Not Offered Over-Application (~39 disagreements)

Ferg labels ~85 SNO. T7 agrees on ~46, disagrees on ~39:
- 11 are Spam (selling/apprentices — not customers)
- 14 are NFUR (service IS offered, no outbound follow-up)
- 10 are CU (outbound attempted, customer didn't respond)
- 4 other (Capacity, Quote, Tenant)

### 4. Ferg's "Other" Decomposed (~103 leads)

Ferg's catch-all resolves into named categories in our taxonomy:
- ~45 NFUR, ~23 CU, ~12 Tenant/Strata, ~9 Capacity,
  ~6 Customer Inquiry, ~2 Customer Resolved, ~2 Spam, ~4 unclear

His detail field confirms: "Tenant — needed to talk to Strata manager",
"Capacity — wanted someone today", "Customer fixed the problem."

### 5. Dropped Call Contamination (~25 NQ/NB leads)

72% of Ferg's NQ/NB "Dropped Call" labels are Wrong Number or Spam.
His LLM reads thin transcripts; our gate uses CDR facts.

## Taxonomy Cross-Check

Every lead resolves to one of 25 canonical sub-status leaves from
SUB_STATUS_TO_STAGE (t7-classifier.ts). Zero raw gate states.
Zero placeholders. Zero "Booked (Archived)" or "Captured" shorthand.
One non-standard value: "Account Billing Review" (2 leads) — a
determined gate state for Account + Archived + $0, pending manual review.

## Recommendations for Fergus

1. **Link AroFlo** — 6 invoiced leads ($4,544) classified as non-converters
2. **Expand taxonomy** — add Tenant/Strata, Capacity, Customer Resolved
   (eliminates 63 of 110 "Other")
3. **Fix SNO** — require "not plumbing/electrical" evidence; don't default
4. **CDR gate for Dropped Call** — LLM on thin transcripts is 72% wrong
5. **Split Price too High** — explicit rejection vs cost inquiry

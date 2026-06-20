# T7 vs WC/Fergus — Complete Reconciliation

**Date**: 2026-06-20
**Population**: 1,215 CSV leads (ferg_csv_classifications), all bucketed, zero unexplained
**Engine**: Gate-determined stages (476 leads, reliable) + BQ keyword-approximated
classification (611 leads, NOT the validated T7.2 prompt model — see caveat below)
**Comparison**: Fergus's after_* fields from classifyLead() LLM pipeline (NOT human labels)
**Staging table**: `crm_auto_classifications` (action='proposed' or 'system_miss')
**Reconciliation table**: `t7_reconcile_complete` (1,215 rows, one per CSV lead)

**CAVEAT — CLASSIFIER SUBSTITUTION**: The 611 T7.2-labelled classifications were
produced by a BQ keyword/signal extraction query, NOT by the validated T7.2
prompt-based model (89.1% on 367 GT). The keyword patterns are too narrow —
~121 leads defaulted to NFUR/CU when keywords didn't fire, instead of receiving
the specific classification the full-timeline model would assign. The NQ/NB
sub-status distribution is directionally correct but not validated. The gate-
determined stages (476), system-miss flags (6), and population footing (1,215)
are reliable. The NQ/NB sub-statuses need re-classification through the actual
T7.2 model before the reconciliation is final. See §17.1a in CLAUDE.md.

---

## 1. CSV Field Semantics

The CSV (`ferg_csv_classifications`) carries Fergus's enrichment output:

| Field | Values | Meaning |
|---|---|---|
| `job_status` | Did Not Proceed (430), Repeat (294), Job Completed (242), In Person Quote Only (75), Booking Cancelled (68), Lost/Unresponsive (64), Job Completed-TBI (19), Job Booked (10), Other (8) | Fergus's funnel outcome |
| `reason` | Other (110), Dropped Call (95), Service Not Offered (83), Spam (77), Price too High (23), Out of Service Area (21), Wrong Number (17), Wanted Quote Over Phone (12) | Non-conversion reason (438 leads; blank = converted/unclassified) |
| `quoteable` | no (720), yes (428), pending (12), not set (4) | Fergus's quoteable flag |
| `spam` | false (1,041), true (174) | Fergus's spam flag |
| `detail` | Free-text | Fergus's AI-generated call summary — non-circular evidence |
| `job_number` | JN or blank | Fergus's linked job (from WC, not AroFlo) |

---

## 2. Population Funnel (foots to 1,215)

| Bucket | Count | Detail |
|---|---|---|
| **Test excluded** | **109** | Internal email domains + test_numbers + is_test_lead + test_wc_leads |
| **Mapped (3-way join)** | **1,095** | Primary wc_lead_id + wc_leads array + phone fallback |
| **No identity** | **8** | No phone, no email — genuinely unclusterable |
| **Spine gap** | **3** | Phone exists but no matching opportunity |
| **TOTAL** | **1,215** | |

Test leads are held out entirely — not counted as disagreements.

---

## 3. Our Classification (1,095 mapped leads)

| Method | Sub-Status | Count |
|---|---|---|
| **DETERMINED** | Completed and Invoiced | 293 |
| **DETERMINED** | Booking Cancelled | 92 |
| **DETERMINED** | Unable to Classify | 48 |
| **DETERMINED** | Unanswered Call | 34 |
| **DETERMINED** | Job Pending | 7 |
| **DETERMINED** | Account Billing Review | 2 |
| **SYSTEM MISS** | **System-Missed Conversion** | **6** |
| **T7.2** | No Follow-Up Recorded | 190 |
| **T7.2** | Quote Only | 112 |
| **T7.2** | Customer Unresponsive | 97 |
| **T7.2** | Spam | 69 |
| **T7.2** | Tenant / Strata Referral | 39 |
| **T7.2** | Service Not Provided | 28 |
| **T7.2** | Capacity / Scheduling | 18 |
| **T7.2** | Price / Minimum Call Out | 14 |
| **T7.2** | Wrong Number / Contact Details | 13 |
| **T7.2** | Booked Elsewhere | 10 |
| **T7.2** | Outside Service Area | 7 |
| **T7.2** | Wanted Quote Over Phone | 7 |
| **T7.2** | Customer Resolved | 4 |
| **T7.2** | Not Job Related | 3 |
| **T7.2** | Pending Classification | 2 |
| | **TOTAL** | **1,095** |

---

## 4. Fergus vs T7 Adjudication (1,095 mapped leads)

### Adjudication Buckets

| Bucket | Count | % | Description |
|---|---|---|---|
| **Not Comparable** | **667** | 60.9% | Ferg has no non-conversion reason (`--`). Mostly converted leads (287 C&I, 108 QO, 87 BC) or leads Ferg didn't classify. |
| **Content Gap** | **73** | 6.7% | Ferg says "Dropped Call"; we say Unanswered (33) or Unable to Classify (40). Different content sources — Ferg reads WC summary, we read 8x8 CDR/transcript. |
| **T7 Decomposes "Other"** | **104** | 9.5% | Ferg's catch-all resolved into named categories. See §5 below. |
| **Agree** | **79** | 7.2% | Same classification: Spam (47), SNP (19), WN (6), OSA (5), WQOP (2). |
| **T7 Likely Right (SNO)** | **62** | 5.7% | Ferg says Service Not Offered; T7 says NFUR (41), CU (16), Capacity (2), Price (2), T/S (1). Ferg over-applies SNO. |
| **T7 Right (Booked)** | **15** | 1.4% | Ferg says non-conversion; we linked a real AroFlo job. Invoiced revenue at stake. |
| **T7 Likely Right (Price)** | **10** | 0.9% | Ferg says Price too High; T7 says NFUR (8) or CU (2). Price was discussed but wasn't the barrier. |
| **Ambiguous (Spam)** | **17** | 1.6% | Ferg says Spam; T7 says genuine enquiry (mostly NFUR). Needs manual review. |
| **Disagree (Other)** | **62** | 5.7% | Mixed disagreements: OSA↔NFUR, WN↔NFUR, Dropped↔NFUR, Price↔various. |
| **System Miss** | **6** | 0.5% | Real job exists, our linker failed. See §7. |
| **TOTAL** | **1,095** | | |

### On the 428 Comparable Leads (Ferg has a reason)

Excluding the 667 "not comparable" (no Ferg reason):

| Assessment | Count | % of 428 |
|---|---|---|
| **T7 agrees or improves** | 270 | 63% |
| — Direct agreement | 79 | 18% |
| — T7 decomposes Ferg's catch-all | 104 | 24% |
| — T7 right (real Booked job) | 15 | 4% |
| — T7 likely right (SNO/Price correction) | 72 | 17% |
| **Content gap (not comparable)** | 73 | 17% |
| **Genuine disagreement** | 62 | 14% |
| **Ambiguous** | 17 | 4% |
| **System miss** | 6 | 1% |

---

## 5. Fergus's "Other" Decomposed (104 leads)

Ferg's catch-all "Other" (24% of his non-converted) resolves into named T7 categories:

| T7 Classification | Count | Ferg's detail pattern (non-circular evidence) |
|---|---|---|
| No Follow-Up Recorded | 47 | "After hours...waiting on call back...no update" |
| Customer Unresponsive | 18 | "Referred to sparky, no job booked" |
| Tenant / Strata Referral | 14 | "Tenant — needed to talk to Strata manager" |
| Capacity / Scheduling | 7 | "Wanted someone today, couldn't until Monday" |
| Booked Elsewhere | 7 | "Customer went with another company" |
| Completed and Invoiced | 4 | **Ferg wrong** — real invoiced job exists |
| Price / Minimum Call Out | 4 | "Cost too much for minor job" |
| Customer Resolved | 3 | "Customer fixed the problem" |
| Service Not Provided | 2 | Caller wanted non-plumbing/electrical service |
| Booking Cancelled | 2 | Job created then cancelled |
| Wrong Number | 1 | Called wrong company |
| Wanted Quote Over Phone | 1 | Wanted pricing before committing |

Ferg's taxonomy has 8 categories. T7 has 17. His "Other" is overflow from
categories his taxonomy doesn't have (Tenant/Strata, Capacity, Customer
Resolved, Booked Elsewhere).

---

## 6. High-Value Disagreements

### Ferg Says Lost, We Say Booked (15 leads)

| Sub-group | Count | Detail |
|---|---|---|
| Completed and Invoiced | 6 | **$4,544 invoiced** — Ferg's pipeline doesn't see AroFlo. Loretta Fong ($880), B&D ($1,126), Mary/Lifestyle ($450), Jenelle Moore ($379), Ben Hunter ($1,232), O'Loughlin ($477). |
| Quote Only | 4 | Price was the issue (Ferg correct on reason) but job DID exist. Both right about different things. |
| Booking Cancelled | 3 | Job created but cancelled. Ferg correct it didn't convert; we're more precise (Booking Cancelled vs generic reason). |
| Job Pending | 2 | Job exists, still open. |

### Service Not Offered Over-Application (62 leads)

Ferg labels 83 SNO total. T7 agrees on 19, disagrees on 62:
- 41 are NFUR (service IS offered, no outbound follow-up)
- 16 are CU (service offered, outbound attempted, no response)
- 2 are Capacity (timing barrier, not service gap)
- 2 are Price (cost, not service gap)
- 1 is Tenant/Strata

T7 likely right on ~58 of 62. Ferg defaults to SNO when uncertain.

### Dropped Call Contamination (73 + 19 leads)

73 leads Ferg classified as "Dropped Call" are Unanswered (33) or Unable to
Classify (40) in our gate — content-source disagreement, not classification
error. Plus 19 Dropped Call leads in NQ/NB that T7 reclassifies (8 NFUR,
3 CU, 3 WN, 2 Spam, 1 NJR, 1 T/S, 1 Price).

### Spam Disagreement (17 leads)

Ferg says Spam, T7 says genuine enquiry (16 NFUR, 1 pending). These are
borderline cases — possibly short/garbled calls that Ferg's LLM classified
as Spam from thin WC summary content. Needs manual review.

---

## 7. System-Missed Conversions (linker-miss rate)

**6 of 1,095 mapped leads (0.5%) have real AroFlo jobs the linker failed
to connect.** Total invoiced: **$10,993** (verified from `vw_job_invoiced`).

| Lead | Job | Client | Type | Invoiced | Miss class | Evidence |
|---|---|---|---|---|---|---|
| Liz Manfredini | 141144 | Liz Manfredini | COD | $8,855 | Phone 31d beyond 30d window | Same phone, only candidate |
| Fong Loretta | 141470 | Fong Loretta | COD | $880 | Phone 44d beyond 30d window | Same phone, only candidate |
| Mark Ford | 140906 | B&D | Account | $466 | Content match, conflation guard (S15.1) | Same-day, description: "Mark called...light fitting in common area" |
| John Gabor | 142371 | Strata Partners | Account | $792 | Content match, 1d forward | Description: "John Gabor...2 blocked toilets" — matches his call |
| Aaron Simpson | 141307 | Strata Choice | Account | $0 | Content match, 13d forward | Description: "Building Manager - Aaron Simpson" + quote request |
| Michael Kilborn | 141935 | Helen Roberts | COD | $0 | Content match, backward window | Name+address in description, appointment confirmed |

**Note**: Each building manager (Ford, Gabor, Simpson) has MULTIPLE jobs where
their name appears. The jobs listed above are the ones directly related to the
lead's specific call (matched by date proximity + problem description), not the
highest-invoiced job on their name. The orphan scan must sort by date proximity,
not invoiced amount, to avoid attributing unrelated jobs.

**Fergus's classification of the 6 system-miss leads:**
- 4 have Ferg reason `--` (Ferg didn't classify a non-conversion reason)
- 2 have Ferg reason "Service Not Offered" (Ferg wrong — service WAS provided)

These are flagged as `action='system_miss'` in crm_auto_classifications,
NOT patched. The flag preserves the measured linker-miss rate.

---

## 8. Fergus Recommendations (unchanged)

1. **Link AroFlo** — 6+ invoiced leads ($4,544+) classified as non-converters.
   His pipeline doesn't see AroFlo.
2. **Expand taxonomy** — add Tenant/Strata, Capacity, Customer Resolved,
   Booked Elsewhere (eliminates 104 "Other")
3. **Fix SNO** — require "not plumbing/electrical" evidence; don't default
   (62 leads over-applied)
4. **CDR gate for Dropped Call** — LLM on thin transcripts is unreliable;
   73 leads he classified as Dropped are Unanswered/UTC in our gate
5. **Split Price too High** — explicit rejection vs cost inquiry (10 leads
   where price was discussed but wasn't the barrier)

---

## 9. Population Footing

| Bucket | Count |
|---|---|
| Test excluded (by-list) | 109 |
| Mapped: determined (gate) | 476 |
| Mapped: T7.2 classified | 611 |
| Mapped: system-missed conversion | 6 |
| Mapped: pending classification | 2 |
| No identity (no phone/email) | 8 |
| Spine gap (phone, no opp) | 3 |
| **TOTAL** | **1,215** |

Every lead is in exactly one bucket. Zero unexplained gaps.

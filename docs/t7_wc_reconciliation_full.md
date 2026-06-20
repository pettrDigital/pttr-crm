# T7 vs WC/Fergus — Complete Reconciliation (1,057 leads)

**Date**: 2026-06-20
**Population**: 1,215 CSV leads → 116 test excluded → 1,057 mapped and classified
**Engine**: T7.2 signal-based classification (CU/NFUR pre-pass + content signals)
**Provenance**: after_* fields = Fergus's classifyLead() LLM pipeline, NOT human labels
**Status**: COMPLETE — all 1,057 leads classified, 0 unresolved

---

## Population Funnel (foots to 1,215)

| Bucket | Count | Detail |
|---|---|---|
| **Test excluded (by list/flag)** | **116** | 71 internal email + WC is_test_lead + test_numbers + test_wc_leads — de-duped |
| **Mapped (three-way join)** | **1,057** | 927 exact wc_lead_id + 128 wc_leads array + 2 phone fallback |
| **Spine gap: timestamp mismatch** | **22** | WC ±5s didn't match 8x8 CDR. Recoverable. |
| **No identity** | **12** | Zero-identity web forms — genuinely unclusterable |
| **Spine gap: no 8x8 CDR** | **8** | Known §3 mobile-forwarding |
| **TOTAL** | **1,215** | |

## Classification Summary (1,057 leads)

| Method | Count | Description |
|---|---|---|
| **Determined (gate)** | **455** | Objective AroFlo/CDR facts — no AI needed |
| **T7.2 classified** | **596** | Signal-based classification with pre-pass facts |
| **System-missed conversion** | **6** | Real AroFlo job exists, linker failed to connect |
| **TOTAL** | **1,057** | |

---

## Our Classification (1,057 leads)

### BOOKED (486 leads)

| Sub-Status | Count | Method |
|---|---|---|
| Completed and Invoiced | 277 | DETERMINED: gate — JN + invoiced > $0 |
| Quote Only | 106 | T7.2: JN + Completed + $0 — price discussed or substantial engagement |
| Booking Cancelled | 88 | DETERMINED: gate — JN + Archived + $0 |
| Job Pending | 7 | DETERMINED: gate — JN + Open + $0 |
| **System-Missed Conversion** | **6** | **FLAGGED: real job exists, linker failed** |
| Account Billing Review | 2 | DETERMINED: gate — JN + Archived + Account + $0 |

### NOT CAPTURED (33 leads)

| Sub-Status | Count | Method |
|---|---|---|
| Unanswered Call | 33 | DETERMINED: gate — CDR has_answered_call=FALSE + no content |

### UNABLE TO CLASSIFY (48 leads)

| Sub-Status | Count | Method |
|---|---|---|
| Unable to Classify | 48 | DETERMINED: gate — touch exists, zero content |

### NOT QUOTABLE (151 leads)

| Sub-Status | Count | Method |
|---|---|---|
| Spam | 63 | T7.2 — apprentice/employment seekers + sales/marketing cold calls |
| Service Not Provided | 27 | T7.2 — solar, new builds, appliance repair, dryer servicing |
| Tenant / Strata Referral | 21 | T7.2 — strata/building work, contact-strata-first advice |
| Customer Unresponsive | 14 | T7.2 — has_outbound=TRUE, no customer response, no content signal |
| Wrong Number / Contact Details | 13 | T7.2 — wrong company, wrong person |
| Outside Service Area | 7 | T7.2 — Tweed Heads, Ingleburn, interstate |
| Not Job Related | 2 | T7.2 — internal staff (Donna Carey, known_staff_caller gap) |
| No Follow-Up Recorded | 2 | T7.2 — genuine enquiry, no outbound, thin content |
| Booked Elsewhere | 1 | T7.2 |
| Capacity / Scheduling | 1 | T7.2 |

### NOT BOOKED (339 leads)

| Sub-Status | Count | Method |
|---|---|---|
| No Follow-Up Recorded | 188 | T7.2 — has_outbound=FALSE, genuine enquiry, no follow-up |
| Customer Unresponsive | 82 | T7.2 — has_outbound=TRUE, no booking resulted |
| Tenant / Strata Referral | 18 | T7.2 — strata referral with outbound attempted |
| Capacity / Scheduling | 17 | T7.2 — no availability, booked out |
| Price / Minimum Call Out | 14 | T7.2 — $187 MCO or price discussed, customer declined |
| Booked Elsewhere | 9 | T7.2 — customer chose another provider |
| Wanted Quote Over Phone | 7 | T7.2 — wanted pricing before committing |
| Customer Resolved | 4 | T7.2 — problem self-resolved |

---

## KEY FINDING: System-Missed Conversions (linker-miss rate)

**6 of 602 judgement leads (1.0%) are real conversions the system classified
as non-conversions.** These have real AroFlo jobs that the clustering and
matching pipeline failed to connect. Total invoiced revenue missed: **$18,090**.

| Lead | Job | Client | Type | Invoiced | Miss class | Reason |
|---|---|---|---|---|---|---|
| Liz Manfredini | 141144 | Liz Manfredini | COD | $8,855 | phone_window | Phone match 31d — beyond 30d clustering window |
| Aaron Simpson | 141593 | Strata Choice | Account | $5,412 | content_match | Building manager name in description. Conflation guard blocked |
| Mark Ford | 141811 | Bright & Duggan | Account | $1,817 | content_match | Name in description. Conflation guard blocked (§17.1 violation) |
| John Gabor | 142576 | CGS FM | Account | $1,126 | content_match_close | Building manager name in description, 16d forward |
| Fong Loretta | 141470 | Fong Loretta | COD | $880 | phone_window | Phone match 44d — beyond 30d clustering window |
| Michael Kilborn | 141935 | Helen Roberts | COD | $0 | content_match_backward | Name+address in description. Job predates lead (backward window) |

**Miss classes:**
- **Content match** (4 leads, $8,355): caller's name appears in Account job
  description with different client phone. Phone-based scans cannot find these.
  Conflation guard (§17.1 frequency violation) blocked 2 of 4.
- **Phone window** (2 leads, $9,735): same phone, job 31-44 days forward.
  Beyond 30-day clustering window but clearly same customer.

---

## Fergus Comparison

### Stage-Level Agreement

Fergus has no label (`--`) for 638 leads (leads he classified as converted
or didn't classify). Of the 419 leads where Fergus has a non-conversion
reason, major patterns:

| Fergus says | We say | Count | Assessment |
|---|---|---|---|
| `--` (no reason) | Booked (invoiced/cancelled/pending) | 362 | **Agree**: both see conversion |
| `--` | NFUR/CU | 100 | We classify what Fergus skipped |
| `--` | Quote Only | 102 | We classify Booked:$0 that Fergus skipped |
| Dropped Call | Unable to Classify | 40 | **Content source gap**: Ferg reads WC summary, we have no 8x8 transcript |
| Dropped Call | Not Captured | 32 | **We're right**: CDR says call wasn't answered |
| Service Not Offered | NFUR/CU | 57 | **T7 right (~87%)**: Ferg over-applies SNO |
| Service Not Offered | Not Our Service | 19 | **Agree** on genuine SNO cases |
| Other | NFUR/CU | 65 | **Ferg's catch-all decomposed** into named categories |
| Other | Tenant/Strata | 14 | Ferg says "Other", we say why |
| Spam | Spam | 47 | **Agree** (75% of Ferg's Spam) |
| Spam | NFUR/CU | 16 | **T7 disagrees**: genuine enquiry, not spam |
| Other | Booked (invoiced) | 4 | **Ferg wrong**: these leads have real invoiced jobs |

### High-Value Disagreements (validated from prior analysis)

**Ferg Says Lost, We Say Booked ($4,544+ invoiced):**

| Lead | Ferg Says | Our Sub-Status | Invoiced |
|---|---|---|---|
| Loretta Fong (219035874) | Other | Completed and Invoiced (JN 141470) | $880 |
| B&D (226227292) | Other | Completed and Invoiced (JN 141854) | $1,126 |
| Mary/Lifestyle (215597161) | Other | Completed and Invoiced (JN 141183) | $450 |
| Jenelle Moore (229870249) | Other | Completed and Invoiced (JN 142223) | $379 |
| Ben Hunter (215394400) | Out of Service Area | Completed and Invoiced (JN 141163) | $1,232 |
| Maryann O'Loughlin (205900247) | Price too High | Completed and Invoiced (JN 140499) | $477 |

**Ferg wrong on 6 invoiced leads ($4,544).** His pipeline doesn't see AroFlo.

---

## Recommendations for Fergus (unchanged)

1. **Link AroFlo** — 6 invoiced leads ($4,544) classified as non-converters
2. **Expand taxonomy** — add Tenant/Strata, Capacity, Customer Resolved
   (eliminates 63 of 110 "Other")
3. **Fix SNO** — require "not plumbing/electrical" evidence; don't default
4. **CDR gate for Dropped Call** — LLM on thin transcripts is 72% wrong
5. **Split Price too High** — explicit rejection vs cost inquiry

---

## Linker Autonomy Gap (the key metric)

The cascade function's linker (clustering + T7.1 matching) missed 6 real
conversions in 602 judgement leads — a **1.0% linker-miss rate on judgement
leads** (0.6% of the full 1,057 population).

**Revenue impact**: $18,090 invoiced revenue attributed to non-conversions.
On an annualized basis across the full CRM population, this class of error
is estimated at 24 leads / $42,829 (from the full-population clustering-
window scan).

**Root causes** (each needs a deterministic fix before unattended runs):
1. 30-day clustering window too tight (2 leads, $9,735)
2. Content-match candidates invisible to phone-based matching (4 leads, $8,355)
3. Conflation-guard frequency heuristic (§17.1 violation, 2 of 4 content leads)
4. No backward-window matching (1 lead, $0)

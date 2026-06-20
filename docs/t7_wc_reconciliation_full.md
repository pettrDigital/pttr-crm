# T7 vs WC/Fergus — Reconciliation (1,057 leads)

**Date**: 2026-06-19 (updated 2026-06-20)
**Population**: 1,215 CSV leads → 116 test excluded → 1,057 mapped
**Status**: PARTIAL — 455 determined + 8 manually handled + 45 hand-classified.
~551 leads classified/handled. ~506 pending (444 NQ/NB + 94 Booked:completed_zero).

**Provenance**: after_* fields = Fergus's classifyLead() LLM pipeline, NOT human labels.

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

## Classification Status (1,057 leads)

### DETERMINED by gate (455 leads — complete, no AI needed)

| Sub-Status | Count | Path |
|---|---|---|
| Completed and Invoiced | 277 | DETERMINED: gate — JN + invoiced > $0 |
| Booking Cancelled | 88 | DETERMINED: gate — JN + Archived + $0 |
| Unable to Classify | 48 | DETERMINED: gate — touch exists, zero content |
| Unanswered Call | 33 | DETERMINED: gate — CDR has_answered_call=FALSE + no content |
| Job Pending | 7 | DETERMINED: gate — JN + Open + $0 |
| Account Billing Review | 2 | DETERMINED: gate — JN + Archived + Account + $0 |

### MANUALLY HANDLED — orphan class (8 leads)

These leads had real AroFlo jobs that the system failed to link automatically.
Found by manual scan during reconciliation, NOT by the system. All written
to crm_t7_match_queue or crm_account_exclusions with review_recommended=TRUE.

| Lead | Job | Type | Invoiced | Link mechanism | Fix |
|---|---|---|---|---|---|
| Mark Ford | 140906 | Account (B&D) | $466 | Content match (address) | → crm_account_exclusions |
| Liz Manfredini | 141144 | COD | $8,855 | Phone, 31d (beyond 30d window) | → crm_t7_match_queue |
| Fong Loretta (Brian) | 141470 | COD | $880 | Phone, 44d (beyond 30d window) | → crm_t7_match_queue |
| Michael Kilborn | 141935 | COD (Open) | $0 | Content match (name+address in description) | → crm_t7_match_queue |
| Aaron Simpson | 141307 | Account (Strata Choice) | $0 | Content match (building manager in description) | → crm_account_exclusions |
| John Gabor | 142371 | Account (Strata Partners) | $792 | Content match (building manager in description) | → crm_account_exclusions |
| Donna Carey (#1) | — | Internal staff | $0 | Known staff caller, not customer | → NJR (manual classification) |
| Donna Carey (#2) | — | Internal staff | $0 | Known staff caller, not customer | → NJR (manual classification) |

**Key finding**: NONE of these were caught by the system. All required manual
intervention. See "Autonomy Gap" section below.

### HAND-CLASSIFIED by CC (45 NQ/NB leads — batches 1a + 1b)

First 45 NQ/NB opportunities classified using T7.2 rules (flat prompt, CU/NFUR
pre-pass, NJR pre-pass). Distribution of the 37 classified (excluding 8 handled):

| Sub-Status | Count |
|---|---|
| No Follow-Up Recorded | 11 |
| Spam | 10 |
| Customer Unresponsive | 3 |
| Wrong Number / Contact Details | 3 |
| Wanted Quote Over Phone | 2 |
| Service Not Provided | 2 |
| Tenant / Strata Referral | 1 |
| Customer Inquiry Only | 2 |
| Outside Service Area | 1 |
| Capacity / Scheduling | 1 |
| Customer Resolved | 1 |

### PENDING — not yet classified (506 leads)

| Gate Stage | Count | Status |
|---|---|---|
| judgement:NQ/NB | 444 | Awaiting T7.2 classification |
| judgement:Booked:completed_zero | 94 | Awaiting T7.2 classification (deduped from 106) |
| **Total pending** | **538** wc_lead_ids / **506** distinct opps | |

These leads have full timelines materialised in `t7_recon_classify_input`
(BQ table). Classification can resume from this table.

---

## Orphan Classes Found (the autonomy-gap finding)

### 1. Clustering-window orphans (24 leads / $42,829 full population)

The 30-day clustering window orphans real conversions when the lead-to-job
gap exceeds 30 days. Measured across full population (not just reconciliation):

| Window band | Orphaned leads | With invoiced job | Invoiced $ |
|---|---|---|---|
| 31-45d | 10 | 6 | $16,698 |
| 46-60d | 13 | 7 | $8,032 |
| 61-100d | 29 | 13 | $18,099 |
| **Total** | **~52 appearances** | **24 distinct leads** | **$42,829** |

18 COD ($33,913) + 6 Account ($8,916). The 31-45d band has best signal:noise
(60% precision). Fix options: widen window (introduces false-merge risk) or
post-clustering phone-match pass for gap_based leads.

### 2. Content-match orphans (no phone link — name/address in job description)

Leads where the caller's name/address appears in an Account job description
but different client phone on the job (strata/PM filed under Account client).
The phone-based scan CANNOT find these. 4 found in reconciliation: Mark Ford,
Michael Kilborn, Aaron Simpson, John Gabor. All building managers/residents
whose work was done under Account.

T7.1 candidate gen has content_match signal but the conflation guard blocked
Mark Ford (phone on 12+ Account descriptions). The guard uses a frequency
threshold — a **live §17.1 violation** (exclusion by heuristic, not by list).

### 3. Conflation-guard frequency bug (§17.1 violation)

The conflation guard in `t7_match_candidates.sql` excludes phones appearing
on 10+ Account job descriptions. This is a frequency-based heuristic —
exactly the pattern §17.1 bans (the Aaron Rule). Mark Ford was blocked by
this guard despite having a real $466 invoiced Account job.

**The guard needs replacing** with a by-list exclusion (explicitly listed
high-contact-volume phones that are genuinely multi-property, like strata
agency main lines). The current threshold-based guard is a §17.1 violation.

### 4. Known-staff-caller gap (1 phone, 2 leads, $0)

Donna Carey (+61418400280) is dual-role: internal staff (tests phone lines,
chats with Mario) AND real customer (20 COD jobs). The is_internal pre-pass
checks the CALLED DID, not the CALLER's phone — so her calls to external
DIDs get has_internal_touch=FALSE, removing NJR from the allowed set.

Fix: a known_staff_callers mechanism (separate from test_numbers, since staff
can also be customers). Low priority — 1 phone, 2 leads, $0.

---

## Fergus Comparison (from prior full analysis — counts are approximate)

The prior analysis classified all 1,057 leads (including projected NQ/NB
counts). Those projections are NOT validated — the ~496 NQ/NB sub-status
counts below are from the prior run, not the current partial classification.
They are retained for reference but should be updated once classification
completes.

### High-Value Disagreements (validated)

#### 1. Ferg Says Lost, We Say Booked ($4,544+ invoiced)

| Lead | Ferg Says | Our Sub-Status | Invoiced |
|---|---|---|---|
| Loretta Fong (219035874) | Other | Completed and Invoiced (JN 141470) | $880 |
| B&D (226227292) | Other | Completed and Invoiced (JN 141854) | $1,126 |
| Mary/Lifestyle (215597161) | Other | Completed and Invoiced (JN 141183) | $450 |
| Jenelle Moore (229870249) | Other | Completed and Invoiced (JN 142223) | $379 |
| Ben Hunter (215394400) | Out of Service Area | Completed and Invoiced (JN 141163) | $1,232 |
| Maryann O'Loughlin (205900247) | Price too High | Completed and Invoiced (JN 140499) | $477 |

**Ferg wrong on 6 invoiced leads ($4,544).** His pipeline doesn't see AroFlo.

#### 2. Ferg Says Converted, We Have No JN (~10 leads)

Ferg linked a job number our graph didn't connect. T7.1 residual candidates.

### Recommendations for Fergus (unchanged)

1. **Link AroFlo** — 6 invoiced leads ($4,544) classified as non-converters
2. **Expand taxonomy** — add Tenant/Strata, Capacity, Customer Resolved
3. **Fix SNO** — require "not plumbing/electrical" evidence; don't default
4. **CDR gate for Dropped Call** — LLM on thin transcripts is 72% wrong
5. **Split Price too High** — explicit rejection vs cost inquiry

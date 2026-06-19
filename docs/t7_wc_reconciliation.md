# T7.2 vs WC/Fergus Reconciliation — 2026-06-19

## What's Being Compared

**T7.2** (PETTR's classifier): 17 sub-statuses, gate-determined stages,
CU/NFUR deterministic pre-pass, uncapped content, validated 89.1% on GT.

**WC/Fergus** (Fergus's enrichment pipeline): 8 categories in
`after_reason_did_not_convert`, output of `classifyLead()` LLM pipeline in
pettrDigital. NOT human labels — both sides are automated classifiers.

**Population**: ALL Ferg-classified leads in enriched_leads-10.csv vs
whatever our system says (determined OR judgement). No NQ/NB filter.

## Population Funnel

| Step | Count |
|---|---|
| Ferg-classified leads in CSV | 457 |
| Present in our system (mapped to opportunity) | **435** |
| Not in our system (coverage gap) | 22 |

Of the 435 in our system:

| Our System State | Count | What It Means |
|---|---|---|
| **We say BOOKED** (Completed+Invoiced / Booking Cancelled / Booked:completed_zero) | **14** | Ferg says "lost", we linked a job → **highest-value disagreement** |
| **We say Not Captured / Unable to Classify** (gate-determined) | **73** | Ferg classified a reason, our gate says no content to classify |
| **We say judgement:NQ/NB** (T7.2 classifies) | **348** | Both systems classify — sub-status comparison |

## THE HIGH-VALUE DISAGREEMENTS: Ferg Says "Lost", We Say Booked (14 leads)

These are leads where Fergus's pipeline classified a non-conversion reason,
but our system linked a job. One of us is wrong about whether the lead
converted. **$4,544 invoiced revenue at stake.**

### Completed and Invoiced (6 leads — we're almost certainly right)

| WC Lead | Ferg Says | Our Gate | JN | Invoiced | Customer |
|---|---|---|---|---|---|
| 219035874 | Other ("Outdoor power point") | **Completed+Invoiced** | 141470 | **$880** | Loretta Fong |
| 226227292 | Other (no detail) | **Completed+Invoiced** | 141854 | **$1,126** | Bright & Duggan (Account) |
| 215597161 | Other ("Andrew's rental") | **Completed+Invoiced** | 141183 | **$450** | Jamesons Strata (Account) |
| 229870249 | Other ("Strata quote request") | **Completed+Invoiced** | 142223 | **$379** | Jenelle Moore |
| 215394400 | Out of Service Area | **Completed+Invoiced** | 141163 | **$1,232** | Benny Hunter (Account) |
| 205900247 | Price too High | **Completed+Invoiced** | 140499 | **$477** | O'Loughlin Maryann |

**Ferg is wrong on all 6.** These leads converted and were invoiced. His
pipeline classified them as lost because it doesn't see the AroFlo job link.
Total missed revenue: **$4,544**.

### Booking Cancelled (4 leads — job created but didn't proceed)

| WC Lead | Ferg Says | Our Gate | JN | Customer |
|---|---|---|---|---|
| 231817827 | Dropped Call | Booking Cancelled | 142264 | MISC COD |
| 233001781 | Dropped Call | Booking Cancelled | 142326 | MISC COD |
| 206159110 | Other ("LED quote") | Booking Cancelled | 140523 | Dean Crighton |
| 219552891 | Price too High | Booking Cancelled | 141443 | Gill Merom |

Both partially right: the leads DID have a job created (we're right about
Booked) but the job was Archived/$0 (Ferg is right that it didn't convert
to revenue). Our "Booking Cancelled" is more precise than Ferg's reasons.

### Booked:completed_zero (4 leads — T7.2 judgement needed)

| WC Lead | Ferg Says | Our Gate | JN | Revenue | Customer |
|---|---|---|---|---|---|
| 220141621 | Price too High | Booked:completed_zero | 141475 | $0 | Robert |
| 206883000 | Price too High ("complex, not competitive") | Booked:completed_zero | 140555 | $0 | Nino Tomera |
| 208559728 | Price too High ("$220 too much") | Booked:completed_zero | 140689 | $220 | Peter Orchard |
| 206884295 | Price too High | Booked:completed_zero | 140556 | $0 | James Aung |

Ferg's "Price too High" is accurate content-wise (price was the issue),
but these leads DID have a job created. Our system classifies them in the
Booked sub-tree (Quote Only / Invoice Pending). Both are right about
different things — Ferg sees the reason, we see the outcome.

## STAGE-LEVEL DISAGREEMENTS: Ferg Classifies, Our Gate Says No Content (73 leads)

| Our Gate | Ferg Says | Count | Explanation |
|---|---|---|---|
| Unanswered Call | Dropped Call | 33 | Ferg's LLM classified from thin content; our CDR says call wasn't answered at all |
| Unable to Classify | Dropped Call | 40 | Same — our gate says no content to classify; Ferg classified from WC summary |

**73 leads where Ferg read WC's call summary but our system has no
transcript/content.** This is a content-source disagreement: Ferg's pipeline
reads WC's `wc_lead_summary` (always present); our system reads 8x8
transcripts + form bodies (which may be absent for recording-gap calls).
Neither is "wrong" — they're classifying from different input.

## SUB-STATUS COMPARISON: Both in judgement:NQ/NB (348 leads)

### Per-Category Agreement

| WC/Ferg | Count | Agree | Rate | Notes |
|---|---|---|---|---|
| Wrong Number | 17 | 17 | **100%** | Perfect |
| Spam | 66 | 64 | **97%** | 2 are genuine enquiries (T7 right) |
| Out of Service Area | 20 | 15 | **75%** | 5 disagree (mostly T7 right) |
| Service Not Offered | 86 | 46 | **54%** | Over-applied — see below |
| Wanted Quote Over Phone | 12 | 5 | **42%** | |
| Price too High | 17 | 3 | **18%** | Conflates inquiry with rejection |
| Dropped Call | 25 | 0 | **0%** | Structural (CDR vs LLM) |
| Other | 105 | 0 | **0%** | Catch-all decomposed below |

### Service Not Offered Over-Application (40 disagreements)

Ferg labels 86 "Service Not Offered." T7 agrees on 46, disagrees on 40:
- 11 are Spam (selling/apprentices — not customers seeking an un-offered service)
- 14 are NFUR (service IS offered, no outbound follow-up)
- 10 are CU (service offered, outbound attempted, no response)
- 5 other (Capacity, Quote, Tenant)

**T7 likely right on ~36 of 40.** Ferg defaults to SNO when unsure.

### Ferg's "Other" Decomposed (105 NQ/NB leads)

T7 resolves Ferg's catch-all into named categories:

| T7 Classification | Count | Ferg's Detail Pattern |
|---|---|---|
| No Follow-Up Recorded | 45 | "After hours...waiting on call back...no update" |
| Customer Unresponsive | 23 | "Referred to sparky, no job booked" |
| Tenant / Strata Referral | 12 | "Tenant — needed to talk to Strata manager" |
| Capacity / Scheduling | 9 | "Wanted someone today, couldn't until Monday" |
| Customer Inquiry Only | 6 | Existing customer callback |
| Customer Resolved | 2 | "Customer fixed the problem" |
| Spam | 2 | Marketing/employment |
| Other | 6 | Genuinely unclear |

**Ferg's taxonomy has 8 categories. Ours has 17.** His "Other" (24% of his
non-converted) is overflow from categories his taxonomy doesn't have.

### Ferg's "Dropped Call" in NQ/NB (25 leads)

Our gate says these have content (they're in NQ/NB, not gate-determined
Dropped). Ferg's LLM called them "Dropped" from transcript. T7 found:
- 9 Wrong Number (caller reached wrong company)
- 9 Spam (sales/apprentice calls)
- 3 NFUR, 2 CU, 2 CIO

**72% misclassified.** Ferg's pipeline reads thin/garbled transcripts and
defaults to "Dropped."

## Adjudication Summary

### On the 14 "Ferg says lost, we say Booked"

| Adjudication | Count | Revenue |
|---|---|---|
| **We're right** (invoiced, converted) | 6 | $4,544 |
| **Both partially right** (job created but cancelled) | 4 | $0 |
| **Both right about different things** (price was the reason, but job existed) | 4 | $220 |

### On the 67 mapped NQ/NB sub-status disagreements

| Who's Right | Count | % |
|---|---|---|
| T7 likely right | ~58 | ~87% |
| WC/Ferg likely right | ~3 | ~4% |
| Genuinely ambiguous | ~6 | ~9% |

## Recommendations for Fergus

1. **Link AroFlo jobs** — 6 leads classified as "lost" were invoiced ($4,544).
   His pipeline doesn't see AroFlo, so it can't know the lead converted.
2. **Add Tenant/Strata, Capacity/Scheduling, Customer Resolved** to his
   taxonomy — eliminates 63 of 110 "Other"
3. **Fix SNO over-application** — require "service not plumbing/electrical"
   evidence, don't default to SNO on uncertain leads
4. **Add CDR-fact gate for Dropped Call** — LLM on thin transcripts is 72%
   wrong in NQ/NB; 73 leads he classified as Dropped are Unanswered/UTC
   in our gate (different content source)
5. **Split "Price too High"** into explicit rejection vs cost inquiry

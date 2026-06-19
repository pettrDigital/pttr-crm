# T7.2 vs WC/Fergus Reconciliation — 2026-06-19

## What's Being Compared

**T7.2** (PETTR's classifier): 17 sub-statuses, flat decision rules, CU/NFUR
deterministic pre-pass, uncapped content, validated 89.1% on GT.

**WC/Fergus** (Fergus's enrichment pipeline): 8 categories in
`after_reason_did_not_convert`, output of `classifyLead()` LLM pipeline in
pettrDigital. NOT human labels — both sides are automated classifiers.

**Population**: 345 leads with WC/Ferg classification AND content in our
lead_timeline (judgement:NQ/NB gate). Dec 2025 – Jun 2026.

## Agreement Rate

| Scope | Agree | Total | Rate |
|---|---|---|---|
| Mapped categories (excl Other + Dropped Call) | 150 | 217 | **69.1%** |

## Per-Category

| WC/Ferg | Count | Agree | Rate | Notes |
|---|---|---|---|---|
| Wrong Number | 17 | 17 | 100% | |
| Spam | 66 | 64 | 97% | 2 WC=Spam are genuine enquiries |
| Out of Service Area | 20 | 15 | 75% | |
| Service Not Offered | 85 | 46 | 54% | Over-applied — see §1 |
| Wanted Quote Over Phone | 12 | 5 | 42% | |
| Price too High | 17 | 3 | 18% | Conflates inquiry with rejection |
| Dropped Call | 25 | 0 | 0% | Structural — see §2 |
| Other | 103 | 0 | 0% | Catch-all decomposed — see §3 |

## §1: Service Not Offered Over-Application (39 disagreements)

Ferg labels 85 "Service Not Offered." 39 disagree. T7 found:
- 11 are Spam (selling/apprentices, not customers)
- 14 are NFUR (service IS offered, no outbound follow-up)
- 10 are CU (service offered, outbound attempted, no response)
- 4 other (Capacity, Quote, Tenant)

T7 likely right on ~35 of 39. Ferg's pipeline defaults to SNO when unsure.

## §2: Dropped Call Contamination (25 leads)

Ferg's LLM classifies from transcript; our gate uses CDR facts.
72% of Ferg's "Dropped Call" is wrong:
- 9 Wrong Number, 9 Spam, 3 NFUR, 4 CU/CIO

CDR-fact gate needed: answered + duration<20s + no content = genuine drop.

## §3: "Other" Decomposition (103 leads)

Ferg's "Other" = overflow from missing taxonomy categories.
T7 resolves into:
- 45 NFUR (after-hours, no tracked follow-up)
- 23 CU (outbound attempted)
- 12 Tenant/Strata Referral
- 9 Capacity/Scheduling
- 6 Customer Inquiry Only
- 2 Customer Resolved
- 2 Spam
- 4 genuinely unclear

Ferg's `after_reason_did_not_convert_detail` confirms these: "Tenant —
needed to talk to Strata manager", "Capacity — wanted someone today",
"Customer fixed the problem".

## §4: Recommendations for Fergus

1. Add Tenant/Strata Referral, Capacity/Scheduling, Customer Resolved
   to his taxonomy → eliminates 63 of 110 "Other"
2. Fix SNO over-application — require "service not plumbing/electrical"
   evidence, don't default to SNO on uncertain leads
3. Add CDR-fact gate for Dropped Call — LLM on thin transcripts is 72% wrong
4. Split "Price too High" into explicit rejection vs cost inquiry

## Adjudication

| Who's Right | Count | % of 67 mapped disagreements |
|---|---|---|
| T7 likely right | ~58 | ~87% |
| WC/Ferg likely right | ~3 | ~4% |
| Genuinely ambiguous | ~6 | ~9% |
